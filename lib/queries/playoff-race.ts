import { PLAYOFF_BERTHS } from "@/lib/queries/divisions";
import { TOTAL_WEEKS } from "@/lib/schedule/build-schedule";
import type { getSeasonStandings } from "@/lib/queries/seasons";

// Conservative, provably-correct playoff-race tags for late-season standings.
//
// The whole module refuses to ever show a WRONG tag; showing no tag is always
// acceptable (mirroring the LLM guardrail in lib/content-gen/season-phase.ts
// that forbids fabricated clinch claims). Every test below is a mathematical
// guarantee that holds for ALL remaining outcomes and never relies on a
// tiebreaker resolving a particular way.
//
// Division awareness: this league runs 3 divisions with the 3 division winners
// auto-qualifying plus 3 wildcards (6 berths total). That makes a naive
// "top-6-by-wins" clinch/elimination unsound, so:
//   - Clinched is proven via a DIVISION clinch (a team guaranteed to finish
//     ahead of every division-mate wins its division outright -> a berth),
//     which is tiebreaker-free and division-safe.
//   - Eliminated is proven only when a team can neither win its division nor
//     reach a wildcard (at least `berths` teams are already out of its reach).
// When a season has no divisions (legacy era), it falls back to the classic
// league-wide win-bound clinch/elimination, which is sound without divisions.

export type PlayoffRaceTag = "clinched" | "eliminated" | "win-and-in";

/** Only surface tags once the race is meaningful. */
export const MIN_RACE_WEEK = 8;

export interface RaceTeam {
  franchiseId: string;
  wins: number;
  losses: number;
  ties: number;
  /** Division number, or null for legacy/pre-division seasons. */
  division: number | null;
}

export interface RaceOptions {
  /** Total playoff berths (division winners + wildcards). */
  berths: number;
  /** Number of regular-season games each team plays in full. */
  regularSeasonWeeks: number;
  /** True only when the current week is the final regular-season week. */
  isFinalWeek: boolean;
}

function gamesPlayed(t: RaceTeam): number {
  return t.wins + t.losses + t.ties;
}

/** Best-case final wins for a team (wins out its remaining games). */
function maxWins(t: RaceTeam, regularSeasonWeeks: number): number {
  const remaining = Math.max(0, regularSeasonWeeks - gamesPlayed(t));
  return t.wins + remaining;
}

/**
 * Pure tag calculator over an array of teams. Returns a map of franchiseId ->
 * tag for the teams that have a provable tag; teams with no guarantee are
 * simply absent. Never throws; returns an empty map on empty input.
 *
 * NOTE (guarantee scope): every bound here compares INTEGER win counts and so
 * assumes standings are seeded win-count-first (which this league is). If
 * seeding were win%-primary instead, a rare unequal-ties differential (e.g. a
 * team a game ahead in wins but with two extra ties) could invert a placement
 * this math treats as decided, breaking a clinch/elimination guarantee. Note
 * only; no behavior change while seeding stays win-count-first.
 */
export function computePlayoffRaceTags(
  teams: RaceTeam[],
  opts: RaceOptions
): Map<string, PlayoffRaceTag> {
  const tags = new Map<string, PlayoffRaceTag>();
  const { berths, regularSeasonWeeks } = opts;
  if (teams.length === 0 || regularSeasonWeeks <= 0) return tags;

  // Division logic needs EVERY team to carry a division. All-null is the
  // legacy/pre-division case and falls back to the sound league-wide bound.
  // A PARTIALLY populated column (some set, some null) is untrustworthy: the
  // division-aware guarantees would be computed against an incomplete division
  // picture and could emit a provably wrong tag, so we emit no tags at all. A
  // wrong tag is never acceptable; no tag always is.
  const withDivision = teams.filter((t) => t.division != null).length;
  if (withDivision > 0 && withDivision < teams.length) return tags;
  const hasDivisions = withDivision === teams.length;

  const ceilOf = new Map<string, number>();
  for (const t of teams) ceilOf.set(t.franchiseId, maxWins(t, regularSeasonWeeks));

  for (const team of teams) {
    const floor = team.wins; // pessimistic: loses out
    const ceil = ceilOf.get(team.franchiseId)!;
    const remaining = Math.max(0, regularSeasonWeeks - gamesPlayed(team));

    // Teams guaranteed to finish strictly ahead of `team` (their floor beats
    // team's ceiling), i.e. out of team's reach no matter what.
    const guaranteedAhead = teams.filter(
      (o) => o.franchiseId !== team.franchiseId && o.wins > ceil
    ).length;

    let tag: PlayoffRaceTag | null = null;

    if (hasDivisions) {
      const mates = teams.filter(
        (o) => o.franchiseId !== team.franchiseId && o.division === team.division
      );

      // CLINCHED: guaranteed sole division winner (floor beats every mate's
      // ceiling) -> auto-berth, regardless of tiebreakers or other divisions.
      const clinchedDivision = mates.every((m) => floor > ceilOf.get(m.franchiseId)!);

      // Can the team still win its division? Only impossible when a mate is
      // already out of reach ahead of it (mate.floor > team.ceiling).
      const canWinDivision = !mates.some((m) => m.wins > ceil);

      if (clinchedDivision) {
        tag = "clinched";
      } else if (!canWinDivision && guaranteedAhead >= berths) {
        // Cannot win the division AND at least `berths` teams are out of reach
        // ahead. Among those `berths` teams at most (berths - wildcards) are
        // division winners, so at least `wildcards` non-winners are ahead of
        // team -> every wildcard is taken. With no division path either, out.
        tag = "eliminated";
      } else if (opts.isFinalWeek && remaining === 1) {
        // WIN AND IN: if the team wins its last game, would it clinch its
        // division? (floor+1 beats every mate's ceiling, all other games still
        // free to break any way.)
        const winFloor = team.wins + 1;
        if (mates.every((m) => winFloor > ceilOf.get(m.franchiseId)!)) {
          tag = "win-and-in";
        }
      }
    } else {
      // League-wide (no divisions): classic sound bounds.
      // CLINCHED: fewer than `berths` other teams can even reach team's floor.
      const canReachFloor = teams.filter(
        (o) => o.franchiseId !== team.franchiseId && ceilOf.get(o.franchiseId)! >= floor
      ).length;
      if (canReachFloor < berths) {
        tag = "clinched";
      } else if (guaranteedAhead >= berths) {
        tag = "eliminated";
      } else if (opts.isFinalWeek && remaining === 1) {
        const winFloor = team.wins + 1;
        const canReachWinFloor = teams.filter(
          (o) =>
            o.franchiseId !== team.franchiseId &&
            ceilOf.get(o.franchiseId)! >= winFloor
        ).length;
        if (canReachWinFloor < berths) tag = "win-and-in";
      }
    }

    if (tag) tags.set(team.franchiseId, tag);
  }

  return tags;
}

/**
 * Convenience wrapper over live standings rows. Maps a season's standings to
 * race tags, gated so nothing shows before MIN_RACE_WEEK, outside the regular
 * season, or when data looks incomplete (no games played yet). Pure: reads no
 * database, only the already-fetched standings plus the season's calendar.
 */
export function computeStandingsRaceTags(
  standings: Awaited<ReturnType<typeof getSeasonStandings>>,
  opts: { week: number; playoffWeekStart: number | null | undefined }
): Map<string, PlayoffRaceTag> {
  const empty = new Map<string, PlayoffRaceTag>();
  if (standings.length === 0) return empty;

  // Regular-season length: the week before the playoffs start, or the schedule
  // default when the season carries no playoff-start week.
  const regularSeasonWeeks =
    opts.playoffWeekStart && opts.playoffWeekStart > 1
      ? opts.playoffWeekStart - 1
      : TOTAL_WEEKS;

  // Gate: only late regular season, and only once real games exist.
  if (opts.week < MIN_RACE_WEEK) return empty;
  if (opts.week > regularSeasonWeeks) return empty;

  const teams: RaceTeam[] = standings.map((s) => ({
    franchiseId: s.franchiseId,
    wins: s.wins ?? 0,
    losses: s.losses ?? 0,
    ties: s.ties ?? 0,
    division: s.division ?? null,
  }));

  const anyGamesPlayed = teams.some((t) => gamesPlayed(t) > 0);
  if (!anyGamesPlayed) return empty;

  return computePlayoffRaceTags(teams, {
    berths: PLAYOFF_BERTHS,
    regularSeasonWeeks,
    isFinalWeek: opts.week === regularSeasonWeeks,
  });
}
