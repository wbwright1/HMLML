import { SyncTimestamp } from "@/components/sync-timestamp";
import { TrendingRail } from "@/components/trending-rail";
import { getAllPlayersWithStats, getAllFranchiseNames } from "@/lib/queries/players";
import { getLatestSeason } from "@/lib/queries/matchups";
import { getNflState, resolveLiveSeasonSegment } from "@/lib/queries/nfl-state";
import {
  getCurrentWeekPlayerStatusByPlayer,
  getTrendingAddPlayers,
} from "@/lib/queries/player-points";
import { decideWeekDisplay } from "@/lib/game-status";
import { getAwardsByPlayerIds } from "@/lib/queries/awards";
import type { AwardChipData } from "@/components/award-chip";
import { PlayerTable, type PlayerRow } from "./player-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Players | Harambe Memorial League Memorial League",
  description:
    "Browse every player in the Harambe Memorial League Memorial League: sort by fantasy points, position, age, experience, and filter by team.",
};

interface PlayersPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const { q } = await searchParams;

  const [players, franchises, latestSeason, nflState, trendingPlayers] = await Promise.all([
    getAllPlayersWithStats(),
    getAllFranchiseNames(),
    getLatestSeason(),
    getNflState(),
    getTrendingAddPlayers(10),
  ]);

  // Derive the stats/projection seasons from the first player that has each.
  const statsSeason = players.find((p) => p.statsSeason != null)?.statsSeason ?? null;
  const projSeason = players.find((p) => p.projSeason != null)?.projSeason ?? null;

  // Resolve the three-segment season model (offseason -> preseason -> in-season)
  // from data, no hardcoded dates. It drives which column leads the table:
  //   - offseason:  last season's PTS leads (today's layout).
  //   - preseason:  the season-long PROJ leads, PTS de-emphasized second.
  //   - in-season:  the merged "this week" WK column leads, PTS second.
  const segment = await resolveLiveSeasonSegment(latestSeason, nflState);

  // Preseason: the season-long projection leads (headline PROJ column).
  const projLeads = segment === "preseason" && projSeason != null;

  // In-season: fetch per-player week status for the merged WK column. The
  // current NFL week comes from nfl_state; guard on the season matching the
  // latest season row so a stale off-season nfl_state can't mis-key the query.
  const isCurrentSeason =
    !!latestSeason && !!nflState && Number(nflState.season) === latestSeason.seasonYear;
  const currentWeek = isCurrentSeason && nflState ? nflState.week : null;

  const weekStatusByPlayer =
    segment === "in_season" && isCurrentSeason && latestSeason && nflState
      ? await getCurrentWeekPlayerStatusByPlayer(latestSeason.id, nflState.week)
      : new Map<
          string,
          { points: number | null; projected: number | null; gameStatus: string | null }
        >();

  const trendingCountByPlayer = new Map(
    trendingPlayers.map((p) => [p.playerId, p.count])
  );

  // League-award badges ("MVP '25") for the players in view. Empty pre-seed.
  const awardsMap = await getAwardsByPlayerIds(players.map((p) => p.id));
  const awardsByPlayerId: Record<string, AwardChipData[]> = {};
  for (const [playerId, badges] of awardsMap) {
    awardsByPlayerId[playerId] = badges.map((b) => ({
      awardType: b.awardType,
      seasonYear: b.seasonYear,
    }));
  }

  // The WK column leads in-season (never alongside the preseason PROJ column).
  const showWkColumn = segment === "in_season" && weekStatusByPlayer.size > 0;
  const showTrdColumn = trendingCountByPlayer.size > 0;

  const playerRows: PlayerRow[] = players.map((player) => {
    const wk = weekStatusByPlayer.get(player.id);
    const display = wk
      ? decideWeekDisplay(wk.gameStatus, wk.points, wk.projected)
      : null;
    return {
      ...player,
      weekValue: display?.value ?? null,
      weekIsProjected: display?.isProjected ?? false,
      trendingCount: trendingCountByPlayer.get(player.id) ?? null,
    };
  });

  return (
    <section className="py-8 md:py-12 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-kicker">
            Player Universe &middot; {players.length} Players
          </p>
          <h1 className="text-h1">Players.</h1>
        </div>
        <SyncTimestamp dataType="players" />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px] lg:items-start">
        <aside className="lg:order-2">
          <TrendingRail players={trendingPlayers} />
        </aside>
        <PlayerTable
          players={playerRows}
          franchises={franchises}
          statsSeason={statsSeason}
          projSeason={projSeason}
          projLeads={projLeads}
          currentWeek={currentWeek}
          initialQuery={q ?? ""}
          showWkColumn={showWkColumn}
          showTrdColumn={showTrdColumn}
          awardsByPlayerId={awardsByPlayerId}
        />
      </div>
    </section>
  );
}
