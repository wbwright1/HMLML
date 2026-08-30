import { LiveMatchupCard } from "@/components/live-matchup-card";
import { computeWinProbability } from "@/lib/win-probability";
import { deriveLiveAside } from "@/lib/live-aside";
import { buildHubLineFooter } from "@/lib/book/shared";
import type { HubLiveData } from "@/lib/queries/homepage";
import type { PairedMatchup } from "@/lib/queries/matchups";
import type { getSeasonStandings } from "@/lib/queries/seasons";
import type { getPlayoffProjection } from "@/lib/queries/divisions";
import type { PlayoffRaceTag } from "@/lib/queries/playoff-race";
import type { BookGame } from "@/lib/queries/book";

/** Small left-aligned stat card for the hub hero row. */
export function StatChip({
  label,
  value,
  context,
}: {
  label: string;
  value: string;
  context?: string;
}) {
  return (
    <div className="card-surface px-4 py-3 min-w-[9rem]">
      <p className="text-kicker mb-1.5">{label}</p>
      <p className="text-stat text-2xl text-text-primary leading-none">
        {value}
        {context && (
          <span className="ml-2 font-sans text-body-sm font-normal text-text-tertiary">
            {context}
          </span>
        )}
      </p>
    </div>
  );
}

/** Maps a PairedMatchup's status to the LiveMatchupCard status union. */
export function cardStatus(status: string): "live" | "final" | "upcoming" {
  if (status === "in_progress") return "live";
  if (status === "complete") return "final";
  return "upcoming";
}

/** Renders a live/final game card for a paired matchup. */
export function GameCard({
  matchup,
  week,
  seasonYear,
  hubLive,
  avatars,
  isRivalry,
  bookGame,
}: {
  matchup: PairedMatchup;
  week: number;
  seasonYear: number;
  hubLive?: HubLiveData;
  /** franchiseId → per-season crest URL; absent entries fall back to monograms. */
  avatars?: ReadonlyMap<string, string>;
  /** True when this pairing is a mutual-top-rival Rivalry Week matchup. */
  isRivalry?: boolean;
  /** The Book's priced line for this matchup, when one exists. Omitted
   * entirely (no footer at all) when book_lines has no row for the week. */
  bookGame?: BookGame;
}) {
  const status = cardStatus(matchup.status);
  const homeRoster = matchup.homeTeam.rosterId;
  const awayRoster = matchup.awayTeam.rosterId;

  // We have per-week lineup data only when getPlayersLeftCounts saw starters
  // for both sides. That gate keeps win-prob and players-left off when the
  // backfill has not run for this week (empty maps → cards render as before).
  const homeLeft = hubLive?.playersLeft.get(homeRoster);
  const awayLeft = hubLive?.playersLeft.get(awayRoster);
  const hasPlayerData = homeLeft != null && awayLeft != null;

  let winProbHome: number | undefined;
  let playersLeft: { home: number; away: number } | undefined;
  let aside: string | undefined;
  if (status === "live" && hasPlayerData) {
    winProbHome = computeWinProbability({
      scoreA: matchup.homeTeam.points,
      scoreB: matchup.awayTeam.points,
      projRemainingA: hubLive?.projRemaining.get(homeRoster) ?? 0,
      projRemainingB: hubLive?.projRemaining.get(awayRoster) ?? 0,
    });
    playersLeft = { home: homeLeft.left, away: awayLeft.left };
    // Swing-moment aside, derived deterministically from the live snapshot.
    aside =
      deriveLiveAside({
        homeScore: matchup.homeTeam.points,
        awayScore: matchup.awayTeam.points,
        winProbHome,
        playersLeft,
      }) ?? undefined;
  }

  // The Book's line text is computed from BookGame's own home/away pinning
  // (the lower roster_id), which is independent of which side the hub shows
  // first: it is a fact about the game, not about display order.
  const bookFooter = bookGame ? buildHubLineFooter(bookGame) : undefined;

  return (
    <LiveMatchupCard
      matchupId={matchup.matchupId}
      homeTeam={{
        name: matchup.homeTeam.franchiseName,
        slug: matchup.homeTeam.franchiseSlug,
        score: matchup.homeTeam.points,
        abbreviation: matchup.homeTeam.franchiseAbbreviation,
        brandingColor: matchup.homeTeam.franchiseBrandingColor,
        avatarUrl: avatars?.get(matchup.homeTeam.franchiseId) ?? null,
      }}
      awayTeam={{
        name: matchup.awayTeam.franchiseName,
        slug: matchup.awayTeam.franchiseSlug,
        score: matchup.awayTeam.points,
        abbreviation: matchup.awayTeam.franchiseAbbreviation,
        brandingColor: matchup.awayTeam.franchiseBrandingColor,
        avatarUrl: avatars?.get(matchup.awayTeam.franchiseId) ?? null,
      }}
      status={status}
      week={week}
      seasonYear={seasonYear}
      winProbHome={winProbHome}
      playersLeft={playersLeft}
      aside={aside}
      isRivalry={isRivalry}
      bookFooter={bookFooter}
    />
  );
}

/** Maps standings rows to the ladder card's entry shape. RISK-A: rank is
 * always derived from record (wins DESC, points DESC), never
 * standingsFinish, which is null in-season and only populated by the legacy
 * importer post-season. Optionally merges a playoff projection's seed/in-out
 * data keyed by franchiseId, and provably-correct playoff-race tags. */
export function toLadderEntries(
  standings: Awaited<ReturnType<typeof getSeasonStandings>>,
  projection?: Awaited<ReturnType<typeof getPlayoffProjection>>,
  /** Provably-correct playoff-race tags keyed by franchiseId; absent = none. */
  raceTags?: ReadonlyMap<string, PlayoffRaceTag>
) {
  const projectionById = new Map(
    (projection?.field ?? []).map((t) => [t.franchiseId, t])
  );
  const bubbleById = projection?.firstOut
    ? new Map([[projection.firstOut.franchiseId, projection.firstOut]])
    : new Map();

  const ordered = [...standings].sort(
    (a, b) => (b.wins ?? 0) - (a.wins ?? 0) || (b.pointsScored ?? 0) - (a.pointsScored ?? 0)
  );

  return ordered.map((s, i) => {
    const projected = projectionById.get(s.franchiseId) ?? bubbleById.get(s.franchiseId);
    return {
      rank: i + 1,
      franchiseName: s.franchiseName,
      franchiseSlug: s.franchiseSlug,
      record:
        (s.ties ?? 0) > 0
          ? `${s.wins ?? 0}-${s.losses ?? 0}-${s.ties}`
          : `${s.wins ?? 0}-${s.losses ?? 0}`,
      abbreviation: s.franchiseAbbreviation,
      brandingColor: s.franchiseBrandingColor,
      avatarUrl: s.avatarUrl ?? null,
      division: s.division,
      divisionName: s.divisionName,
      seed: projected?.seed ?? null,
      isDivisionWinner: projected?.isDivisionWinner ?? false,
      isIn: projection ? (projected?.isIn ?? false) : undefined,
      raceTag: raceTags?.get(s.franchiseId),
    };
  });
}
