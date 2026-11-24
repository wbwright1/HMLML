import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { TeamLink } from "@/components/team-link";
import { PlayerLink } from "@/components/player-link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamFlag, type FlagTeam } from "@/components/hub/team-flag";
import {
  HubSection,
  LinkRows,
  RailCard,
  HUB_ROW_LINK,
} from "@/components/hub/rail-card";
import { buttonVariants } from "@/components/ui/button-variants";
import { HUB_LABELS, SNARKY_LABELS, sentenceCaseLabel } from "@/lib/content";
import { teamOfWeekVerdict, type RecapPlayer, type TeamOfWeek } from "@/lib/hub/week-recap";
import type { RecapTeam, WeekRecap } from "@/lib/queries/week-recap";
import type { WeeklySuperlatives } from "@/lib/queries/superlatives";
import type { WeekBenchLeader } from "@/lib/queries/lineup-efficiency";

/**
 * The post-week recap ("the newsletter"): leads the between-weeks hub from
 * the Tuesday-morning week roll until the Thursday-morning cron, on every
 * screen size. Three modules, every one a completed-week fact:
 *   1. "Week N wrap": the league's nickname stat tiles (Boom game, Mercy rule,
 *      Photo finish, Dud of the week, Coaching malpractice). No No-show tile:
 *      the hero owns the week's low score. No serif sentence headline either:
 *      it restated the hero.
 *   2. "Final scores": one row per pairing, the whole row a link into the
 *      matchup.
 *   3. "Team of the week": the league-wide optimal lineup. The old Top
 *      performers list is folded in here; it listed mostly the same players.
 *
 * Server component, zero client JS. Renders nothing when the prior week has
 * not fully completed (the query returns null in that case).
 */
export function WeekRecapSection({
  seasonYear,
  recap,
  superlatives,
  benchLeader,
}: {
  seasonYear: number;
  recap: WeekRecap;
  superlatives: WeeklySuperlatives | null;
  benchLeader: WeekBenchLeader | null;
}) {
  const week = recap.week;
  const teamBySlug = new Map<string, RecapTeam>();
  for (const r of recap.results) {
    teamBySlug.set(r.winner.slug, r.winner);
    teamBySlug.set(r.loser.slug, r.loser);
  }
  const flagOf = (slug: string, fallbackName: string): FlagTeam => {
    const t = teamBySlug.get(slug);
    return {
      name: t?.name ?? fallbackName,
      slug,
      abbreviation: t?.abbreviation ?? null,
      brandingColor: t?.brandingColor ?? null,
      avatarUrl: t?.avatarUrl ?? null,
    };
  };

  const tiles = recapTiles(superlatives, recap.dud, benchLeader, flagOf);

  return (
    <div data-testid="week-recap" className="space-y-8">
      {tiles.length > 0 && (
        <HubSection
          kicker={`Week ${week} wrap`}
          action={
            // Phones get "Box scores" in the hero; desktop's hero has no
            // action row (the topbar carries the claim pill), so it lives here.
            <Link
              href={`/seasons/${seasonYear}/week/${week}`}
              className={cn(buttonVariants({ variant: "quiet", size: "sm" }), "hidden lg:inline-flex")}
            >
              {HUB_LABELS.boxScores}
              <ChevronRight aria-hidden="true" strokeWidth={2} data-icon="inline-end" />
            </Link>
          }
        >
          <div className="card-surface grid grid-cols-2 gap-x-4 gap-y-6 p-6 sm:grid-cols-3">
            {tiles.map((t) => (
              <div
                key={t.label}
                data-testid="recap-tile"
                className={`min-w-0 ${t.wide ? "col-span-2" : ""}`.trim()}
              >
                <p className="text-kicker">{t.label}</p>
                <p
                  className={`mt-2 text-stat text-3xl leading-none ${t.valueClass}`}
                >
                  {t.value}
                </p>
                <div className="mt-1 text-body-sm text-text-secondary">{t.who}</div>
              </div>
            ))}
          </div>
        </HubSection>
      )}

      {recap.results.length > 0 && (
        <HubSection kicker={HUB_LABELS.finalScores} id="final-scores">
          <LinkRows>
            {recap.results.map((r) => (
              <Link
                key={r.matchupId}
                href={`/matchups/${seasonYear}/${week}/${r.matchupId}`}
                data-testid="recap-result"
                className={HUB_ROW_LINK}
              >
                <span className="min-w-0 flex-1 space-y-1.5">
                  <ScoreLine team={r.winner} won />
                  <ScoreLine team={r.loser} won={false} />
                </span>
                <ChevronRight
                  aria-hidden="true"
                  strokeWidth={2}
                  className="size-4 shrink-0 text-text-tertiary"
                />
              </Link>
            ))}
          </LinkRows>
        </HubSection>
      )}

      {recap.teamOfWeek && <TeamOfWeekCard team={recap.teamOfWeek} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrap tiles
// ---------------------------------------------------------------------------

interface RecapTile {
  label: string;
  value: string;
  who: React.ReactNode;
  valueClass: string;
  /** Spans both phone columns (and two of three on wider screens). */
  wide?: boolean;
}

function TwoTeams({ a, b }: { a: FlagTeam; b: FlagTeam }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 [&>a]:shrink-0">
      <TeamFlag team={a} compact className="min-h-11" />
      <span className="text-text-tertiary">over</span>
      <TeamFlag team={b} compact className="min-h-11" />
    </div>
  );
}

function recapTiles(
  s: WeeklySuperlatives | null,
  dud: RecapPlayer | null,
  bench: WeekBenchLeader | null,
  flagOf: (slug: string, name: string) => FlagTeam
): RecapTile[] {
  const tiles: RecapTile[] = [];
  if (s?.highestScorer) {
    tiles.push({
      label: sentenceCaseLabel(SNARKY_LABELS.BOOM_GAME.displayText),
      value: s.highestScorer.points.toFixed(1),
      who: (
        <TeamFlag
          team={flagOf(s.highestScorer.franchiseSlug, s.highestScorer.franchiseName)}
          className="min-h-11"
        />
      ),
      valueClass: "text-text-primary",
    });
  }
  if (s?.biggestBlowout) {
    tiles.push({
      label: sentenceCaseLabel(SNARKY_LABELS.MERCY_RULE.displayText),
      value: `+${s.biggestBlowout.margin.toFixed(1)}`,
      who: (
        <TwoTeams
          a={flagOf(s.biggestBlowout.winnerSlug, s.biggestBlowout.winner)}
          b={flagOf(s.biggestBlowout.loserSlug, s.biggestBlowout.loser)}
        />
      ),
      valueClass: "text-text-primary",
    });
  }
  if (s?.closestWin) {
    tiles.push({
      label: HUB_LABELS.photoFinish,
      value: `+${s.closestWin.margin.toFixed(1)}`,
      who: (
        <TwoTeams
          a={flagOf(s.closestWin.winnerSlug, s.closestWin.winner)}
          b={flagOf(s.closestWin.loserSlug, s.closestWin.loser)}
        />
      ),
      valueClass: "text-text-primary",
    });
  }
  if (dud) {
    tiles.push({
      label: HUB_LABELS.dudOfTheWeek,
      value: dud.points.toFixed(1),
      who: (
        <PlayerLink
          playerId={dud.playerId}
          className="flex min-h-11 min-w-0 items-center"
        >
          <span>
            {dud.name}, {dud.franchiseName}
            {dud.projectedPoints != null && dud.projectedPoints > 0 && (
              <>
                {" "}
                (proj.{" "}
                <span className="font-mono tabular-nums">{dud.projectedPoints.toFixed(1)}</span>)
              </>
            )}
          </span>
        </PlayerLink>
      ),
      valueClass: "text-accent-warm",
    });
  }
  if (bench) {
    const tail =
      bench.won === true ? ", and won anyway" : bench.won === false ? ", and lost anyway" : "";
    tiles.push({
      label: sentenceCaseLabel(SNARKY_LABELS.COACHING_MALPRACTICE.displayText),
      value: bench.pointsLeft.toFixed(1),
      who: (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5">
          <TeamFlag team={flagOf(bench.franchiseSlug, bench.franchiseName)} className="min-h-11" />
          <span>left on the bench{tail}</span>
        </div>
      ),
      valueClass: "text-text-primary",
      wide: true,
    });
  }
  return tiles;
}

// ---------------------------------------------------------------------------
// Final scores
// ---------------------------------------------------------------------------

/** One side of a final: W/L letter, crest and name, then the score. Winners
 * are bold ink, losers regular tertiary, per the W/L typographic rule. The
 * crest is decorative (the name sits beside it) and is not its own link: the
 * whole row is one link into the matchup. */
function ScoreLine({ team, won }: { team: RecapTeam; won: boolean }) {
  return (
    <span
      className={`flex items-center gap-2 text-body-sm ${
        won ? "font-semibold text-text-primary" : "text-text-tertiary"
      }`}
    >
      <span
        className={`text-caption w-3 shrink-0 ${won ? "text-accent-green" : "text-accent-warm"}`}
      >
        {won ? "W" : "L"}
      </span>
      <FranchiseLogo
        slug={team.slug}
        name={team.name}
        abbreviation={team.abbreviation ?? undefined}
        brandingColor={team.brandingColor ?? undefined}
        avatarUrl={team.avatarUrl ?? undefined}
        size={20}
        decorative
      />
      <span className="min-w-0 truncate">{team.name}</span>
      <span className="ml-auto text-stat tabular-nums shrink-0">{team.points.toFixed(1)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Team of the week (league-wide optimal lineup)
// ---------------------------------------------------------------------------

function TeamOfWeekCard({ team }: { team: TeamOfWeek }) {
  return (
    <HubSection
      kicker={HUB_LABELS.teamOfTheWeek}
      action={
        <p className="text-caption text-text-tertiary" data-testid="totw-total">
          {HUB_LABELS.bestPossibleLineup}{" "}
          <span className="text-stat tabular-nums text-body-sm text-text-primary">
            {team.total.toFixed(1)}
          </span>
        </p>
      }
    >
      <p className="text-body-sm text-text-secondary">{teamOfWeekVerdict(team)}</p>
      <LinkRows>
        {team.slots.map((s, i) =>
          s.player ? (
            <PlayerLink
              key={`${s.slot}-${i}`}
              playerId={s.player.playerId}
              className={HUB_ROW_LINK}
            >
              <TotwRow slot={s.slot} player={s.player} />
            </PlayerLink>
          ) : (
            <div key={`${s.slot}-${i}`} data-testid="totw-slot" className="flex min-h-11 items-center gap-3 px-4 py-3">
              <span className="text-caption w-12 shrink-0 text-text-tertiary">{slotLabel(s.slot)}</span>
              <span className="text-body-sm text-text-tertiary">Empty</span>
            </div>
          )
        )}
      </LinkRows>
    </HubSection>
  );
}

/** Slot, player (name, then NFL team and the rostering franchise), points.
 * Rendered inside the row's PlayerLink, so it is all spans. */
function TotwRow({ slot, player }: { slot: string; player: RecapPlayer }) {
  const benched = !player.started;
  return (
    <span data-testid="totw-slot" className="flex min-w-0 flex-1 items-center gap-3">
      <span className="text-caption w-12 shrink-0 text-text-tertiary">{slotLabel(slot)}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-semibold text-text-primary">
          {player.name}
        </span>
        <span className="block truncate text-caption text-text-tertiary">
          {benched && <span className="text-accent-warm">Benched &middot; </span>}
          {player.nflTeam ?? "FA"} &middot; {player.franchiseName}
        </span>
      </span>
      <span className="text-stat tabular-nums text-body text-text-primary shrink-0">
        {player.points.toFixed(1)}
      </span>
    </span>
  );
}

function slotLabel(slot: string): string {
  if (slot === "SUPER_FLEX") return "SFLEX";
  return slot;
}

// ---------------------------------------------------------------------------
// Left on the bench: the desktop rail's fallback when the recap is not
// rendering (window closed, or the prior week not fully complete). While the
// recap renders, the same fact is the wrap's Coaching malpractice tile.
// ---------------------------------------------------------------------------

export function BenchCallout({ leader }: { leader: WeekBenchLeader }) {
  const winTail =
    leader.won === true
      ? " And still won."
      : leader.won === false
        ? " And still lost."
        : "";
  return (
    <HubSection kicker="Left on the bench">
      <RailCard tinted>
        <p className="text-caption text-accent-gold">
          {sentenceCaseLabel(SNARKY_LABELS.COACHING_MALPRACTICE.displayText)}
        </p>
        <p className="mt-2 text-stat tabular-nums text-5xl text-text-primary leading-none">
          {leader.pointsLeft.toFixed(1)}
        </p>
        <div className="mt-4 text-body-sm text-text-secondary">
          points{" "}
          <TeamLink slug={leader.franchiseSlug} className="font-semibold text-text-primary">
            {leader.franchiseName}
          </TeamLink>{" "}
          left on the bench. Optimal was{" "}
          <span className="text-stat tabular-nums text-accent-gold">
            {leader.optimal.toFixed(1)}
          </span>
          , they started{" "}
          <span className="text-stat tabular-nums">{leader.actual.toFixed(1)}</span>.
          {winTail}
        </div>
      </RailCard>
    </HubSection>
  );
}
