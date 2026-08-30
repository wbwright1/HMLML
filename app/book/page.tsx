import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { SyncTimestamp } from "@/components/sync-timestamp";
import { BookTabs } from "@/components/book/book-tabs";
import { BoardIsland } from "@/components/book/board-island";
import { TrackingPane } from "@/components/book/tracking-pane";
import { PropsIsland } from "@/components/book/props-island";
import { FuturesIsland } from "@/components/book/futures-island";
import { BOOK_COPY, FUTURES_COPY, type BookPropView } from "@/lib/book/shared";
import { getBookBoard, resolveBookWeek, type BookGame } from "@/lib/queries/book";
import {
  getPickemsGrid,
  getSeasonAtsLeaderboard,
  getStreakWatch,
  type AtsLeaderboardRow,
  type PickemsGridData,
  type StreakTile,
} from "@/lib/queries/book-tracking";
import { getBookProps } from "@/lib/queries/book-props";
import {
  getFuturesBoards,
  resolveFuturesSeason,
  type FuturesBoard,
} from "@/lib/queries/book-futures";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). The hourly sync re-prices the lines and
// revalidates, which is what makes "re-priced hourly" true. Time window is only
// a backstop (lib/cache.ts).
export const revalidate = 3600;

export const metadata = {
  title: "The Book | Harambe Memorial League Memorial League",
  description:
    "The HMLML sportsbook: weekly spreads and moneylines computed from projections, league consensus, and your pick slip. Friendly wagers only.",
};

export default async function BookPage() {
  let week = 1;
  let games: BookGame[] = [];
  let leaderboard: AtsLeaderboardRow[] = [];
  let grid: PickemsGridData = { divisions: [], rows: [] };
  let streakTiles: StreakTile[] = [];
  let props: BookPropView[] = [];
  let futures: FuturesBoard[] = [];
  let futuresSeasonId: number | null = null;
  let finalRegularWeek = 14;

  try {
    // Which week the weekly board trades and which season the futures book
    // trades are two independent questions; asking them together keeps the
    // page's fetch depth at two round trips rather than three.
    const [bookWeek, futuresSeason] = await Promise.all([
      resolveBookWeek(),
      resolveFuturesSeason(),
    ]);

    if (futuresSeason) {
      futuresSeasonId = futuresSeason.seasonId;
      finalRegularWeek = futuresSeason.finalRegularWeek;
    }
    // Started here so it runs alongside the weekly reads below. Awaited on
    // both branches, so it is never a floating promise.
    const futuresBoards = futuresSeason
      ? getFuturesBoards(futuresSeason)
      : Promise.resolve<FuturesBoard[]>([]);

    if (bookWeek) {
      week = bookWeek.week;
      [games, leaderboard, grid, streakTiles, props, futures] = await Promise.all([
        getBookBoard(bookWeek.seasonId, bookWeek.seasonYear, bookWeek.week),
        getSeasonAtsLeaderboard(bookWeek.seasonId),
        getPickemsGrid(bookWeek.seasonId, bookWeek.seasonYear, bookWeek.week),
        getStreakWatch(bookWeek.seasonId),
        getBookProps(bookWeek.seasonId, bookWeek.week),
        futuresBoards,
      ]);
    } else {
      futures = await futuresBoards;
    }
  } catch (e) {
    // An empty board cached as a "successful" render would serve a dead
    // sportsbook until the next sync. Throw and keep the last good page.
    rethrowUnlessTolerable(e);
  }

// games.length matters as much as the graded data: the Tracking tab is where
  // picks are made now, so it has to render before anything has been graded.
  const hasTrackingData =
    games.length > 0 || leaderboard.length > 0 || grid.rows.length > 0;

  return (
    <div className="pb-12">
      <BookHeader week={week} />

      <BookTabs
        board={<BoardIsland games={games} week={week} />}
        futures={
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-kicker mb-1.5">{FUTURES_COPY.kicker}</p>
              <h2 className="text-h2">{FUTURES_COPY.title}</h2>
              <p className="mt-1.5 font-serif text-body-sm italic text-text-tertiary">
                {FUTURES_COPY.subline}
              </p>
            </div>
            <FuturesIsland
              boards={futures}
              seasonId={futuresSeasonId}
              finalRegularWeek={finalRegularWeek}
            />
            <p className="text-caption normal-case tracking-normal text-text-tertiary">
              {FUTURES_COPY.syncNote}
            </p>
          </div>
        }
        tracking={
          hasTrackingData ? (
            <TrackingPane
              leaderboard={leaderboard}
              grid={grid}
              games={games}
              streakTiles={streakTiles}
              week={week}
            />
          ) : (
            <ComingSoonPane kicker="Tracking" line={BOOK_COPY.trackingSoon} />
          )
        }
        props={<PropsIsland props={props} week={week} />}
      />

      <p className="mt-10 flex flex-wrap items-center justify-center gap-2 text-caption normal-case tracking-normal text-text-tertiary">
        <SyncTimestamp dataType="book_lines" />
        <span aria-hidden="true">·</span>
        <span>{BOOK_COPY.syncNote}</span>
      </p>
    </div>
  );
}

function BookHeader({ week }: { week: number }) {
  return (
    <section className="py-10">
      <p className="text-kicker mb-3">
        {BOOK_COPY.kicker} · Week{" "}
        <span className="font-mono tabular-nums">{week}</span>
      </p>
      <h1 className="text-display">{BOOK_COPY.title}</h1>
      <p className="mt-3 font-serif text-body-sm italic text-text-tertiary">
        {BOOK_COPY.subline}
      </p>
    </section>
  );
}

/**
 * A tab that is not open yet. Deliberately a kicker plus one serif line and
 * nothing else: a dead control that looks live is worse than an honest gap.
 */
function ComingSoonPane({ kicker, line }: { kicker: string; line: string }) {
  return (
    <div className="card-surface p-6">
      <p className="text-kicker mb-2">{kicker}</p>
      <p className="font-serif text-h3 italic text-text-secondary">{line}</p>
    </div>
  );
}
