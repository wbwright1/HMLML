import Link from "next/link";
import { EditorialBody } from "@/components/editorial-emphasis";
import { KickoffCountdown } from "@/components/kickoff-countdown";
import {
  SmackFeed,
  smackItemsFromPosts,
  smackItemsFromSeeds,
} from "@/components/smack-feed";
import { SmackComposerSlot } from "@/components/smack-composer-slot";
import { getRecentSmackPosts, anySmackPostsExist } from "@/lib/queries/smack";
import { PlayerHeadshot } from "@/components/player-headshot";
import { GameOfTheWeekCard } from "@/components/hub/game-of-the-week-card";
import { SlateCard } from "@/components/hub/slate-card";
import { teamAcronym } from "@/lib/team-acronym";
import type { PairedMatchup } from "@/lib/queries/matchups";
import { getTitleGamePair, type getSeasonStandings } from "@/lib/queries/seasons";
import {
  getHeadToHead,
  getHeadToHeadHistory,
  type HeadToHeadRecord,
} from "@/lib/queries/records";
import {
  buildSlateAngles,
  summarizeMeetingHistory,
  type MeetingHistorySummary,
  type SlateAngleInput,
} from "@/lib/hub/slate-angle";
import { getBowlName } from "@/lib/bowl-names";
import { getDivisionStandings } from "@/lib/queries/divisions";
import { getWeeklySuperlatives } from "@/lib/queries/superlatives";
import { getWeekBenchLeader } from "@/lib/queries/lineup-efficiency";
import {
  getWeekStarterPool,
  getPlayersToWatchFromPool,
  sumProjectedByFranchise,
  topProjectedStarterByMatchup,
  type PlayerToWatch,
} from "@/lib/queries/players-to-watch";
import { getRecentLeagueMoves, type LeagueMove } from "@/lib/queries/league-moves";
import { getWeekInHistory, type WeekReceipt } from "@/lib/queries/week-history";
import { FranchiseLogo } from "@/components/franchise-logo";
import { getHubEditorial, matchupPairKey, type HubEditorial } from "@/lib/content";
import { getBookBoard, resolveBookWeek, type BookGame } from "@/lib/queries/book";
import { buildHubLineFooter } from "@/lib/book/shared";
import {
  selectGameOfTheWeek,
  markTitleRematch,
  betweenWeeksHeadline,
  formatH2HLine,
  formatSlateH2H,
  stakesClause,
  kickoffWeekdayName,
  type GotwCandidate,
} from "@/lib/hub/between-weeks";

type Standing = Awaited<ReturnType<typeof getSeasonStandings>>[number];

interface BetweenWeeksHubProps {
  matchups: PairedMatchup[];
  standings: Standing[];
  seasonId: number | null | undefined;
  seasonYear: number;
  week: number;
  nextKickoff: Date | null;
}

/**
 * State 1d: the Tue/Wed between-weeks hub. Anticipation-forward — the week
 * ahead leads (Game of the Week + the rest of the slate + the member smack
 * feed), with last week's receipts compressed into the right rail. Async RSC;
 * does its own data fetching so page.tsx stays lean.
 */
export async function BetweenWeeksHub({
  matchups,
  standings,
  seasonId,
  seasonYear,
  week,
  nextKickoff,
}: BetweenWeeksHubProps) {
  const priorWeek = week > 1 ? week - 1 : week;

  // League-wide games-played gate. At week 1 every franchise is 0-0-0, so a
  // "1st in Division" or "first place on the line" claim would be fabricated
  // (the sort has nothing real to sort on). Once any game has been played,
  // division-leader claims are honest again. Computed from the standings prop
  // up front so both the editorial blurb selection and the GOTW/division
  // logic below share the same flag.
  const anyGamesPlayed = standings.some(
    (s) => (s.wins ?? 0) + (s.losses ?? 0) + (s.ties ?? 0) > 0
  );

  // Between-weeks editorial is week-scoped (matchup angles, GOTW blurb, smack
  // feed for this week); DB content overlays the seeds when present.
  // anyGamesPlayed picks the opener-appropriate seeded GOTW blurb so it never
  // claims "first place on the line" before a single game has been played.
  const editorial = await getHubEditorial({
    seasonId: seasonId ?? undefined,
    week,
    anyGamesPlayed,
  });
  const headline = betweenWeeksHeadline(nextKickoff);

  // Member smack feed: real posts win when present. Site Desk seeds only stand
  // in when the board is genuinely empty (no posts at all); when posts exist
  // but are all hidden, moderation must NOT resurrect the seeds. Member and
  // smack are settled independently so one failing (e.g. the members/smack
  // tables not existing yet on a pre-0008 DB) never blanks the other.
  const [smackResult] = await Promise.allSettled([
    Promise.all([getRecentSmackPosts(4), anySmackPostsExist()]),
  ]);
  const [realSmack, anySmack] =
    smackResult.status === "fulfilled" ? smackResult.value : [[], false];

  const smackFromDesk = realSmack.length === 0 && !anySmack;
  const smackItems = smackFromDesk
    ? smackItemsFromSeeds(editorial.smackPosts)
    : smackItemsFromPosts(realSmack);

  // Standings lookup for records, points-for, and division identity.
  const standingBy = new Map(standings.map((s) => [s.franchiseId, s]));
  const record = (id: string): string => {
    const s = standingBy.get(id);
    return s ? `${s.wins ?? 0}-${s.losses ?? 0}` : "0-0";
  };

  // Rail + division data (degrades to empty when the DB or week has nothing).
  const divisionLeaderStatus = new Map<string, string>();
  const leadsDivision = new Set<string>();
  let weeklySuperlatives: Awaited<ReturnType<typeof getWeeklySuperlatives>> | null =
    null;
  let benchLeader: Awaited<ReturnType<typeof getWeekBenchLeader>> = null;
  let pool: Awaited<ReturnType<typeof getWeekStarterPool>> = [];
  let leagueMoves: LeagueMove[] = [];
  let weekReceipts: WeekReceipt[] = [];
  let bookGames: BookGame[] = [];
  // The full record (streak included), not just the counts: the derived slate
  // angle reads the streak, and it is oriented from the HOME team's
  // perspective because getHeadToHead is called as (home, away) below.
  const h2hByMatchup = new Map<number, HeadToHeadRecord>();
  // Completed-meeting history per matchup, reduced to what the angle ladder
  // needs. Genuinely optional enrichment: an empty entry degrades the ladder
  // to the counts-only rungs rather than blanking the card.
  const h2hHistoryByMatchup = new Map<number, MeetingHistorySummary>();

  if (seasonId != null) {
    try {
      // The Book's week must agree with resolveBookWeek() (the same source
      // /book, the pick server actions, and the sync all use), or the hub can
      // advertise a line for a week The Book is not actually trading (#244).
      const bookWeek = await resolveBookWeek();
      const bookMatchesSlate = bookWeek != null && bookWeek.week === week;

      // Week 1 has no completed prior week: asking "In The Books" or "Left On
      // The Bench" about week 0 would either return null by luck or (if a
      // future data change ever lets it) resurrect a false claim. Skip the
      // fetches outright rather than relying on the empty-shape fallback.
      const [
        divisions,
        superlatives,
        bench,
        weekPool,
        moves,
        receipts,
        board,
        h2hResults,
        historyResults,
      ] = await Promise.all([
        getDivisionStandings(seasonId),
        week === 1
          ? Promise.resolve(null)
          : getWeeklySuperlatives(seasonId, priorWeek),
        week === 1
          ? Promise.resolve(null)
          : getWeekBenchLeader(seasonId, priorWeek),
        getWeekStarterPool(seasonId, week),
        // Both rail cards below read Postgres only: League Moves replaced the
        // Sleeper-backed Trending module, and the history card is our own
        // completed matchups. Neither is week-1 gated; both have real data on
        // opening week (preseason churn, and 2021 onward).
        getRecentLeagueMoves(seasonId, 4),
        getWeekInHistory(seasonYear, week),
        bookMatchesSlate
          ? getBookBoard(bookWeek.seasonId, bookWeek.seasonYear, bookWeek.week)
          : Promise.resolve([]),
        // Both per-matchup batches stay inside this one Promise.all (nested so
        // the outer tuple keeps its types): the all-time counts drive the
        // card's top-right record, the meeting history drives the last-meeting
        // and playoff rungs of the derived angle. Both are cachedQuery-backed
        // and this page is ISR-cached, so the extra round trip is paid once
        // per sync, not per request.
        Promise.all(
          matchups.map((m) =>
            getHeadToHead(m.homeTeam.franchiseId, m.awayTeam.franchiseId)
          )
        ),
        Promise.all(
          matchups.map((m) =>
            getHeadToHeadHistory(m.homeTeam.franchiseId, m.awayTeam.franchiseId)
          )
        ),
      ]);

      weeklySuperlatives = superlatives;
      benchLeader = bench;
      pool = weekPool;
      leagueMoves = moves;
      weekReceipts = receipts;
      bookGames = board;

      if (anyGamesPlayed) {
        for (const group of divisions) {
          group.teams.forEach((t, i) => {
            if (i === 0) {
              leadsDivision.add(t.franchiseId);
              divisionLeaderStatus.set(
                t.franchiseId,
                `1st in ${group.divisionName}`
              );
            }
          });
        }
      }

      matchups.forEach((m, i) => {
        h2hByMatchup.set(m.matchupId, h2hResults[i]);

        // Side A is the HOME team, matching the (home, away) orientation the
        // getHeadToHead call above uses.
        h2hHistoryByMatchup.set(
          m.matchupId,
          summarizeMeetingHistory(historyResults[i] ?? [], m.homeTeam.franchiseId)
        );
      });
    } catch {
      // DB may be unavailable; the hero + countdown still render.
    }
  }

  // Week-1 title rematch: this league opens every season with a rematch of
  // last season's championship game. Only queried at week 1 (weeks 2+ have no
  // use for it), and null degrades to the existing heuristic untouched.
  const titlePair = week === 1 ? await getTitleGamePair() : null;

  // Game of the Week selection from the current slate. Projected totals come
  // from the same starter pool Players to Watch scores over, so no extra
  // query; they only drive the ranking when anyGamesPlayed is false.
  const projectedByFranchise = sumProjectedByFranchise(pool);
  const candidates: GotwCandidate[] = matchups.map((m) => {
    const a = standingBy.get(m.homeTeam.franchiseId);
    const b = standingBy.get(m.awayTeam.franchiseId);
    return {
      matchupId: m.matchupId,
      teamA: {
        wins: a?.wins ?? 0,
        losses: a?.losses ?? 0,
        ties: a?.ties ?? 0,
        pointsFor: Number(a?.pointsScored ?? 0),
        division: a?.division ?? null,
        franchiseId: m.homeTeam.franchiseId,
      },
      teamB: {
        wins: b?.wins ?? 0,
        losses: b?.losses ?? 0,
        ties: b?.ties ?? 0,
        pointsFor: Number(b?.pointsScored ?? 0),
        division: b?.division ?? null,
        franchiseId: m.awayTeam.franchiseId,
      },
      projectedA: projectedByFranchise.get(m.homeTeam.franchiseId) ?? 0,
      projectedB: projectedByFranchise.get(m.awayTeam.franchiseId) ?? 0,
    };
  });
  const markedCandidates = markTitleRematch(candidates, titlePair);

  const gotwId = selectGameOfTheWeek(markedCandidates, anyGamesPlayed, week);
  const gameOfWeek = matchups.find((m) => m.matchupId === gotwId) ?? null;
  const restOfSlate = matchups.filter((m) => m.matchupId !== gotwId);
  const isTitleRematchGame = Boolean(
    markedCandidates.find((c) => c.matchupId === gotwId)?.isTitleRematch
  );
  const bowlName = titlePair ? getBowlName(titlePair.seasonYear) : null;
  const kickoffWeekday = kickoffWeekdayName(nextKickoff);
  const bookGameByMatchup = new Map(bookGames.map((g) => [g.matchupId, g]));

  // Highest projected starter per matchup, from the SAME pool Players to Watch
  // scores over, so the angle ladder's projected-star rung costs no new query.
  const topStarterByMatchup = topProjectedStarterByMatchup(pool);

  // An LLM-authored angle from hub_content outranks the builder, so those
  // cards are settled first and left OUT of the batch below. Otherwise an
  // overridden card would silently consume a hook (the streak, say) that a
  // builder-driven card could have used, and the visible slate would be less
  // varied than it needed to be.
  const angleOverrideOf = (m: PairedMatchup): string | null =>
    editorial.matchupAngles.byPair[
      matchupPairKey(m.homeTeam.franchiseSlug, m.awayTeam.franchiseSlug)
    ] ?? null;
  const needsBuiltAngle = restOfSlate.filter((m) => angleOverrideOf(m) == null);

  // Built as one batch: that is what makes the cards provably distinct
  // (buildSlateAngles moves a later card off a hook an earlier one took).
  const slateAngleInputs: SlateAngleInput[] = needsBuiltAngle.map((m) => {
    const history = h2hHistoryByMatchup.get(m.matchupId);
    const star = topStarterByMatchup.get(m.matchupId);
    return {
      teamA: { name: m.homeTeam.franchiseName },
      teamB: { name: m.awayTeam.franchiseName },
      h2h: h2hByMatchup.get(m.matchupId) ?? null,
      lastMeeting: history?.lastMeeting ?? null,
      playoffMeetingYears: history?.playoffMeetingYears ?? [],
      topProjected: star
        ? {
            playerName: star.playerName,
            position: star.position,
            side: star.franchiseId === m.homeTeam.franchiseId ? "A" : "B",
            projectedPoints: star.projectedPoints,
          }
        : null,
      isTitleRematch: Boolean(
        markedCandidates.find((c) => c.matchupId === m.matchupId)?.isTitleRematch
      ),
      bowlName,
      recordA: record(m.homeTeam.franchiseId),
      recordB: record(m.awayTeam.franchiseId),
      anyGamesPlayed,
      kickoffWeekday,
    };
  });
  const builtAngles = buildSlateAngles(slateAngleInputs);
  const angleByMatchup = new Map(
    needsBuiltAngle.map((m, i) => [m.matchupId, builtAngles[i]])
  );

  // Players to Watch: the pre-kickoff replacement for the retrospective
  // "Standouts" rail. Uses the same pool fetched above; empty (never
  // "Standouts") when the pool is empty or nothing carries a projection.
  let playersToWatch: PlayerToWatch[] = [];
  if (seasonId != null && pool.length > 0) {
    try {
      playersToWatch = await getPlayersToWatchFromPool(pool, seasonId, week, {
        featuredMatchupId: gotwId,
      });
    } catch {
      // The rail is optional content; absence is fine.
    }
  }

  return (
    <>
      {/* Hero + countdown */}
      <section className="pt-2 pb-6 lg:flex lg:items-start lg:justify-between lg:gap-8">
        <div className="max-w-2xl">
          <p className="text-kicker mb-3">
            Harambe Memorial League &middot; Week {week} &middot; The Slate Is Set
          </p>
          <h1 className="text-display">{headline}</h1>
          <p className="mt-3 text-body-lg text-text-secondary">
            <EditorialBody
              body={
                editorial.heroDek ??
                "One grudge match at the top, one annual sacrifice at the bottom, and a week of receipts to settle by Thursday night."
              }
            />
          </p>
        </div>

        {nextKickoff && (
          <div className="mt-6 lg:mt-1 shrink-0">
            <KickoffCountdown target={nextKickoff.toISOString()} />
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Left column: the week ahead */}
        <div className="space-y-8">
          {/* Game of the Week */}
          {gameOfWeek && (
            <GameOfWeekSection
              matchup={gameOfWeek}
              h2h={h2hByMatchup.get(gameOfWeek.matchupId) ?? null}
              record={record}
              divisionOf={(id) => standingBy.get(id)?.division ?? null}
              divisionNameOf={(id) => standingBy.get(id)?.divisionName ?? null}
              avatarOf={(id) => standingBy.get(id)?.avatarUrl ?? null}
              divisionLeaderStatus={divisionLeaderStatus}
              leadsDivision={leadsDivision}
              anyGamesPlayed={anyGamesPlayed}
              editorial={editorial}
              isTitleRematch={isTitleRematchGame}
              bowlName={bowlName}
            />
          )}

          {/* The Rest of the Slate */}
          {restOfSlate.length > 0 && (
            <section className="space-y-4">
              <p className="text-kicker">The Rest of the Slate</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {restOfSlate.map((m) => {
                  const h2h = h2hByMatchup.get(m.matchupId);
                  const angle =
                    angleOverrideOf(m) ?? angleByMatchup.get(m.matchupId) ?? "";
                  const bookGame = bookGameByMatchup.get(m.matchupId);
                  return (
                    <SlateCard
                      key={m.matchupId}
                      teamA={{
                        name: m.homeTeam.franchiseName,
                        slug: m.homeTeam.franchiseSlug,
                        abbreviation: m.homeTeam.franchiseAbbreviation,
                        brandingColor: m.homeTeam.franchiseBrandingColor,
                        avatarUrl: standingBy.get(m.homeTeam.franchiseId)?.avatarUrl ?? null,
                      }}
                      teamB={{
                        name: m.awayTeam.franchiseName,
                        slug: m.awayTeam.franchiseSlug,
                        abbreviation: m.awayTeam.franchiseAbbreviation,
                        brandingColor: m.awayTeam.franchiseBrandingColor,
                        avatarUrl: standingBy.get(m.awayTeam.franchiseId)?.avatarUrl ?? null,
                      }}
                      h2hRecord={
                        h2h ? formatSlateH2H(h2h) : record(m.homeTeam.franchiseId)
                      }
                      angle={angle}
                      bookFooter={bookGame ? buildHubLineFooter(bookGame) : undefined}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* The Smack Feed */}
          <section className="space-y-4">
            <div className="flex items-baseline justify-between">
              <p className="text-kicker">The Smack Feed &middot; Week {week}</p>
              <p className="text-caption text-text-tertiary">
                {smackFromDesk
                  ? `site desk · ${smackItems.length} new`
                  : smackItems.length > 0
                    ? `the league · ${smackItems.length} new`
                    : "the league"}
              </p>
            </div>
            <SmackComposerSlot />
            {smackItems.length > 0 ? (
              <SmackFeed
                items={smackItems}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              />
            ) : (
              <p className="card-surface block p-4 text-body-sm text-text-tertiary">
                Nothing on the board right now.
              </p>
            )}
          </section>
        </div>

        {/* Right rail: last week's receipts */}
        <aside className="hidden lg:flex lg:flex-col gap-8">
          {weeklySuperlatives && (
            <WeekInBooksCard week={priorWeek} superlatives={weeklySuperlatives} />
          )}
          {benchLeader && <BenchCallout leader={benchLeader} />}
          {playersToWatch.length > 0 && (
            <PlayersToWatchCard week={week} players={playersToWatch} />
          )}
          {leagueMoves.length > 0 && <LeagueMovesCard moves={leagueMoves} />}
          {weekReceipts.length > 0 && (
            <WeekInHistoryCard week={week} receipts={weekReceipts} />
          )}
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Game of the Week section (resolves kicker + status from data)
// ---------------------------------------------------------------------------

function GameOfWeekSection({
  matchup,
  h2h,
  record,
  divisionOf,
  divisionNameOf,
  avatarOf,
  divisionLeaderStatus,
  leadsDivision,
  anyGamesPlayed,
  editorial,
  isTitleRematch,
  bowlName,
}: {
  matchup: PairedMatchup;
  h2h: { wins: number; losses: number; ties: number } | null;
  record: (id: string) => string;
  divisionOf: (id: string) => number | null;
  divisionNameOf: (id: string) => string | null;
  avatarOf: (id: string) => string | null;
  divisionLeaderStatus: Map<string, string>;
  leadsDivision: Set<string>;
  anyGamesPlayed: boolean;
  editorial: HubEditorial;
  /** True when this matchup is the week-1 rematch of last season's title game. */
  isTitleRematch: boolean;
  /** "HMLML Bowl {roman}" name for last completed season, or null (legacy era). */
  bowlName: string | null;
}) {
  const home = matchup.homeTeam;
  const away = matchup.awayTeam;

  // teamAcronym, not a .slice(0, 3): truncating a team name is not an
  // abbreviation scheme, and it was a third way of deriving a code alongside
  // the persisted column and the shared ladder (see CLAUDE.md).
  const homeAbbr = home.franchiseAbbreviation ?? teamAcronym(home.franchiseName);
  const awayAbbr = away.franchiseAbbreviation ?? teamAcronym(away.franchiseName);

  // Division rematch framing, derived honestly from the two teams' divisions.
  const homeDiv = divisionOf(home.franchiseId);
  const awayDiv = divisionOf(away.franchiseId);
  const isDivisionRematch = homeDiv != null && homeDiv === awayDiv;
  const divisionName = isDivisionRematch
    ? divisionNameOf(home.franchiseId)
    : null;
  // The week-1 title rematch framing wins over the division/cross-division
  // framing (a rematch of last season's championship is the whole point of
  // opening week, division-mate or not). Falls back to "Title Game Rematch"
  // when the champion's season predates the "HMLML Bowl" naming (legacy era).
  const kickerLead = isTitleRematch
    ? bowlName
      ? `${bowlName} Rematch`
      : "Title Game Rematch"
    : divisionName
      ? `${divisionName} Rematch`
      : "Cross-Division";
  const stakes = stakesClause(
    leadsDivision.has(home.franchiseId),
    leadsDivision.has(away.franchiseId),
    anyGamesPlayed
  );
  const kicker = `${kickerLead} · ${stakes}`;

  const h2hLine = h2h
    ? formatH2HLine(h2h, homeAbbr, awayAbbr)
    : "First-ever meeting";

  // The featured card prefers the dedicated Game of the Week blurb (which the
  // generator writes about this exact pair via ctx.gameOfWeekPairKey), falling
  // back to a per-pair matchup angle if no GOTW blurb exists.
  const blurb =
    editorial.matchupAngles.gameOfWeekBlurb ||
    editorial.matchupAngles.byPair[
      matchupPairKey(home.franchiseSlug, away.franchiseSlug)
    ] ||
    "";

  return (
    <section className="space-y-4">
      <p className="text-kicker">Game of the Week</p>
      <GameOfTheWeekCard
        kicker={kicker.toUpperCase()}
        h2hLine={h2hLine}
        teamA={{
          name: home.franchiseName,
          slug: home.franchiseSlug,
          abbreviation: home.franchiseAbbreviation,
          brandingColor: home.franchiseBrandingColor,
          avatarUrl: avatarOf(home.franchiseId),
          record: record(home.franchiseId),
          status: divisionLeaderStatus.get(home.franchiseId) ?? null,
        }}
        teamB={{
          name: away.franchiseName,
          slug: away.franchiseSlug,
          abbreviation: away.franchiseAbbreviation,
          brandingColor: away.franchiseBrandingColor,
          avatarUrl: avatarOf(away.franchiseId),
          record: record(away.franchiseId),
          status: divisionLeaderStatus.get(away.franchiseId) ?? null,
        }}
        blurb={blurb}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Right-rail cards
// ---------------------------------------------------------------------------

function RailCard({
  children,
  tinted = false,
}: {
  children: React.ReactNode;
  tinted?: boolean;
}) {
  return (
    <div className="card-surface relative overflow-hidden p-5">
      {tinted && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(226,184,88,0.10), rgba(226,184,88,0.02))",
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

function RecapRow({
  label,
  desc,
  value,
  tone,
}: {
  label: string;
  desc: string;
  value: string;
  tone: "ink" | "gold" | "warm";
}) {
  const labelClass =
    tone === "gold"
      ? "text-accent-gold"
      : tone === "warm"
        ? "text-accent-warm"
        : "text-text-tertiary";
  const valueClass = tone === "warm" ? "text-accent-warm" : "text-text-primary";
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className={`text-kicker ${labelClass}`}>{label}</p>
        <p className="text-body-sm text-text-secondary truncate">{desc}</p>
      </div>
      <span className={`text-stat tabular-nums text-body ${valueClass} shrink-0`}>
        {value}
      </span>
    </div>
  );
}

function WeekInBooksCard({
  week,
  superlatives,
}: {
  week: number;
  superlatives: NonNullable<Awaited<ReturnType<typeof getWeeklySuperlatives>>>;
}) {
  const { highestScorer, biggestBlowout, closestWin, lowestScorer } = superlatives;
  if (!highestScorer && !biggestBlowout && !closestWin && !lowestScorer) {
    return null;
  }
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-kicker">Week {week}, In The Books</p>
        <Link
          href="/matchups"
          className="text-caption text-accent-gold hover:brightness-110 normal-case tracking-normal"
        >
          Full recap &rarr;
        </Link>
      </div>
      <RailCard>
        <div className="divide-y divide-divider">
          {highestScorer && (
            <RecapRow
              label="High"
              desc={highestScorer.franchiseName}
              value={highestScorer.points.toFixed(1)}
              tone="gold"
            />
          )}
          {biggestBlowout && (
            <RecapRow
              label="Mercy"
              desc={`${biggestBlowout.winner} def. ${biggestBlowout.loser}`}
              value={biggestBlowout.margin.toFixed(1)}
              tone="warm"
            />
          )}
          {closestWin && (
            <RecapRow
              label="Close"
              desc={`${closestWin.winner} over ${closestWin.loser}`}
              value={`+${closestWin.margin.toFixed(1)}`}
              tone="ink"
            />
          )}
          {lowestScorer && (
            <RecapRow
              label="Stinker"
              desc={lowestScorer.franchiseName}
              value={lowestScorer.points.toFixed(1)}
              tone="warm"
            />
          )}
        </div>
      </RailCard>
    </section>
  );
}

function BenchCallout({
  leader,
}: {
  leader: NonNullable<Awaited<ReturnType<typeof getWeekBenchLeader>>>;
}) {
  const winTail =
    leader.won === true
      ? " And still won."
      : leader.won === false
        ? " And still lost."
        : "";
  return (
    <section className="space-y-3">
      <p className="text-kicker">Left On The Bench</p>
      <RailCard tinted>
        <p className="text-kicker text-accent-gold">Highest Possible &middot; Optimal Lineup</p>
        <p className="mt-3 text-stat tabular-nums text-5xl text-text-primary leading-none">
          {leader.pointsLeft.toFixed(1)}
        </p>
        <p className="mt-3 text-body-sm text-text-secondary">
          points{" "}
          <span className="font-semibold text-text-primary">
            {leader.franchiseName}
          </span>{" "}
          left on the bench. Optimal was{" "}
          <span className="text-stat tabular-nums text-accent-gold">
            {leader.optimal.toFixed(1)}
          </span>
          , they started{" "}
          <span className="text-stat tabular-nums">{leader.actual.toFixed(1)}</span>.
          {winTail}
        </p>
      </RailCard>
    </section>
  );
}

function PlayerToWatchRow({ player }: { player: PlayerToWatch }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <PlayerHeadshot
          playerId={player.playerId}
          name={player.name}
          size={56}
          nflTeam={player.team}
        />
        <div className="min-w-0 flex-1">
          <p className="text-kicker text-accent-gold">{player.storyLabel}</p>
          <p className="text-body-sm font-semibold text-text-primary line-clamp-2">
            {player.name}
          </p>
          <p className="text-caption text-text-tertiary truncate">
            {player.team ?? "FA"} &middot; {player.position ?? "?"}
          </p>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {player.storyDetail && (
          <p className="text-body-sm text-text-secondary line-clamp-3">
            <MonoNumerals text={player.storyDetail} />
          </p>
        )}
        {/* The Leap's storyDetail already states the projection and the
            baseline ppg ("Projected 20.8 off 15.3 ppg in 2025"), so a second
            line repeating the same two numbers is redundant, not a new fact. */}
        {player.storyKey !== "leap" && (
          <p className="text-body-sm text-text-tertiary line-clamp-2">
            Projected{" "}
            <span className="text-stat tabular-nums text-text-secondary">
              {player.projectedPoints.toFixed(1)}
            </span>{" "}
            &middot; {player.baselineLabel}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Pre-kickoff replacement for the retrospective "Standouts" rail. Every card
 * is a true claim built from the current week's starter pool: this week's
 * projection plus an honest prior-production baseline (never "Standouts"
 * before a game has been played). Renders nothing when the list is empty.
 */
function PlayersToWatchCard({
  week,
  players,
}: {
  week: number;
  players: PlayerToWatch[];
}) {
  if (players.length === 0) return null;
  return (
    <section className="space-y-3">
      <p className="text-kicker">Players to Watch &middot; Week {week}</p>
      <RailCard>
        <div className="space-y-4 divide-y divide-border [&>*:not(:first-child)]:pt-4">
          {players.map((p) => (
            <PlayerToWatchRow key={p.playerId} player={p} />
          ))}
        </div>
      </RailCard>
    </section>
  );
}

/**
 * Prints a sentence with every numeral in the mono/tabular face, so a story
 * line like "Started 12 games for X in 2025" still obeys the three-font rule
 * without the query layer having to hand back pre-split fragments.
 */
function MonoNumerals({ text }: { text: string }) {
  const parts = text.split(/(\d[\d.,]*)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\d/.test(part) ? (
          <span key={i} className="text-stat tabular-nums">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

/**
 * What the league actually did, straight from our own synced transactions
 * table. Replaced the Sleeper-backed Trending module: this rail is about
 * these twelve teams, not the waiver wire at large, and it costs no live API
 * call on a page path. Renders nothing when there is nothing to show.
 */
function LeagueMovesCard({ moves }: { moves: LeagueMove[] }) {
  if (moves.length === 0) return null;
  return (
    <section className="space-y-3">
      <p className="text-kicker">League Moves</p>
      <RailCard>
        <div className="divide-y divide-border [&>*:not(:first-child)]:pt-3 space-y-3">
          {moves.map((move) => (
            <div key={move.transactionId} className="flex items-center gap-3">
              <div className="flex shrink-0 -space-x-2">
                {move.franchises.map((f) => (
                  <FranchiseLogo
                    key={f.id}
                    slug={f.slug}
                    name={f.name}
                    abbreviation={f.abbreviation ?? undefined}
                    brandingColor={f.brandingColor ?? undefined}
                    avatarUrl={f.avatarUrl}
                    size={28}
                    decorative
                  />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-caption text-text-tertiary truncate">
                  <span className="text-accent-gold">{move.kind}</span>
                  {" · "}
                  {move.franchises.map((f) => f.name).join(" / ")}
                </p>
                <p className="text-body-sm text-text-secondary line-clamp-2">
                  {move.detail}
                </p>
              </div>
              {move.age && (
                <span className="text-caption text-text-tertiary shrink-0">
                  <MonoNumerals text={move.age} />
                </span>
              )}
            </div>
          ))}
        </div>
      </RailCard>
    </section>
  );
}

/**
 * On-this-week receipts from past seasons: the highest score, the worst
 * beating, and the closest call this league has ever produced in this week
 * number. Every line is a real completed game (see lib/queries/week-history).
 */
function WeekInHistoryCard({
  week,
  receipts,
}: {
  week: number;
  receipts: WeekReceipt[];
}) {
  if (receipts.length === 0) return null;
  return (
    <section className="space-y-3">
      <p className="text-kicker">This Week in HMLML History</p>
      <RailCard>
        <div className="divide-y divide-border">
          {receipts.map((r) => (
            <div key={`${r.kind}-${r.seasonYear}`} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-kicker text-accent-gold">
                  {r.label} &middot;{" "}
                  <span className="text-stat tabular-nums">{r.seasonYear}</span>{" "}
                  Week <span className="text-stat tabular-nums">{week}</span>
                </p>
                <span className="text-stat tabular-nums text-body text-text-primary shrink-0">
                  {r.value}
                </span>
              </div>
              <p className="mt-1 text-body-sm text-text-secondary">{r.claim}</p>
            </div>
          ))}
        </div>
      </RailCard>
    </section>
  );
}
