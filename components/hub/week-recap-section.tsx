import Link from "next/link";
import { TeamLink } from "@/components/team-link";
import { PlayerLink } from "@/components/player-link";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PositionBadge } from "@/components/position-badge";
import { TeamFlag, type FlagTeam } from "@/components/hub/team-flag";
import { HubSection, RailCard, RailRows } from "@/components/hub/rail-card";
import { SNARKY_LABELS } from "@/lib/content";
import {
  recapHeadline,
  teamOfWeekVerdict,
  type RecapPlayer,
  type TeamOfWeek,
} from "@/lib/hub/week-recap";
import type { HeroClaim } from "@/lib/hub/hero-claim";
import type { RecapTeam, WeekRecap } from "@/lib/queries/week-recap";
import type { WeeklySuperlatives } from "@/lib/queries/superlatives";
import type { WeekBenchLeader } from "@/lib/queries/lineup-efficiency";

/**
 * The post-week recap ("the newsletter"): leads the between-weeks hub from
 * the Tuesday-morning week roll until Thursday kickoff, on every screen size.
 * Everything in it is a completed-week fact: results, the four team
 * superlatives, the league-wide Team of the Week (optimal lineup), the top
 * started performers, the dud, and the biggest bench blunder.
 *
 * Server component, zero client JS. Renders nothing when the prior week has
 * not fully completed (the query returns null in that case).
 */
export function WeekRecapSection({
  seasonYear,
  recap,
  superlatives,
  benchLeader,
  heroClaim = null,
}: {
  seasonYear: number;
  recap: WeekRecap;
  superlatives: WeeklySuperlatives | null;
  benchLeader: WeekBenchLeader | null;
  /** The hub hero's claim: the recap headline states a different fact. */
  heroClaim?: HeroClaim | null;
}) {
  const week = recap.week;
  const headline = recapHeadline(week, {
    highestScorer: superlatives?.highestScorer ?? null,
    lowestScorer: superlatives?.lowestScorer ?? null,
    biggestBlowout: superlatives?.biggestBlowout ?? null,
    closestWin: superlatives?.closestWin ?? null,
  }, heroClaim);
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

  const tiles = superlatives ? recapTiles(superlatives, flagOf) : [];
  const hasResults = recap.results.length > 0;
  const hasPlayers = recap.topPerformers.length > 0 || recap.dud !== null;

  return (
    <HubSection
      kicker={<>Week {week}, In The Books</>}
      action={
        <Link
          href={`/seasons/${seasonYear}/week/${week}`}
          className="text-caption text-accent-gold hover:brightness-110 normal-case tracking-normal"
        >
          Full box scores &rarr;
        </Link>
      }
    >
      <div data-testid="week-recap" className="space-y-6">
        {/* Headline + the four team superlatives */}
        <div className="card-surface card-glows relative overflow-hidden p-6 md:p-8">
          <p className="text-kicker text-accent-gold">The Week {week} Wrap</p>
          <h2 className="text-h2 mt-2 max-w-3xl" data-testid="recap-headline">
            {headline}
          </h2>
          {tiles.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
              {tiles.map((t) => (
                <div key={t.label} className="min-w-0">
                  <p className={`text-kicker ${t.labelClass}`}>{t.label}</p>
                  <p
                    className={`mt-1 text-stat tabular-nums text-[32px] leading-none ${t.valueClass}`}
                  >
                    {t.value}
                  </p>
                  <div className="mt-2 text-body-sm text-text-secondary">{t.who}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Two top-aligned columns, balanced by content height rather than
            stretched to the tallest card: the ten-slot Team of the Week is
            the tallest block, so it takes the Dud beside it and the shorter
            Final Scores card takes the Top Performers. The bench blunder runs
            full width below as the closing sting. */}
        {(hasResults || hasPlayers || recap.teamOfWeek) && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2 lg:items-start">
            {(hasResults || recap.topPerformers.length > 0) && (
              <div className="space-y-6">
                {hasResults && <ScoreboardCard results={recap.results} />}
                {recap.topPerformers.length > 0 && (
                  <TopPerformersCard players={recap.topPerformers} />
                )}
              </div>
            )}
            {(recap.teamOfWeek || recap.dud) && (
              <div className="space-y-6">
                {recap.teamOfWeek && <TeamOfWeekCard team={recap.teamOfWeek} />}
                {recap.dud && <DudCard player={recap.dud} />}
              </div>
            )}
          </div>
        )}

        {benchLeader && <BenchCallout leader={benchLeader} />}
      </div>
    </HubSection>
  );
}

// ---------------------------------------------------------------------------
// Superlative tiles
// ---------------------------------------------------------------------------

interface RecapTile {
  label: string;
  value: string;
  who: React.ReactNode;
  labelClass: string;
  valueClass: string;
}

function recapTiles(
  s: WeeklySuperlatives,
  flagOf: (slug: string, name: string) => FlagTeam
): RecapTile[] {
  const tiles: RecapTile[] = [];
  if (s.highestScorer) {
    tiles.push({
      label: SNARKY_LABELS.BOOM_GAME.displayText,
      value: s.highestScorer.points.toFixed(1),
      who: <TeamFlag team={flagOf(s.highestScorer.franchiseSlug, s.highestScorer.franchiseName)} />,
      labelClass: "text-accent-gold",
      valueClass: "text-text-primary",
    });
  }
  if (s.lowestScorer) {
    tiles.push({
      label: SNARKY_LABELS.NO_SHOW.displayText,
      value: s.lowestScorer.points.toFixed(1),
      who: <TeamFlag team={flagOf(s.lowestScorer.franchiseSlug, s.lowestScorer.franchiseName)} />,
      labelClass: "text-accent-warm",
      valueClass: "text-accent-warm",
    });
  }
  if (s.biggestBlowout) {
    tiles.push({
      label: SNARKY_LABELS.MERCY_RULE.displayText,
      value: `+${s.biggestBlowout.margin.toFixed(1)}`,
      who: (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 [&>a]:shrink-0">
          <TeamFlag team={flagOf(s.biggestBlowout.winnerSlug, s.biggestBlowout.winner)} compact />
          <span className="text-text-tertiary">over</span>
          <TeamFlag team={flagOf(s.biggestBlowout.loserSlug, s.biggestBlowout.loser)} compact />
        </div>
      ),
      labelClass: "text-accent-warm",
      valueClass: "text-text-primary",
    });
  }
  if (s.closestWin) {
    tiles.push({
      label: "Photo Finish",
      value: `+${s.closestWin.margin.toFixed(1)}`,
      who: (
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 [&>a]:shrink-0">
          <TeamFlag team={flagOf(s.closestWin.winnerSlug, s.closestWin.winner)} compact />
          <span className="text-text-tertiary">over</span>
          <TeamFlag team={flagOf(s.closestWin.loserSlug, s.closestWin.loser)} compact />
        </div>
      ),
      labelClass: "text-text-tertiary",
      valueClass: "text-text-primary",
    });
  }
  return tiles;
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

function ScoreboardCard({ results }: { results: WeekRecap["results"] }) {
  return (
    <section className="space-y-4">
      <p className="text-kicker">Final Scores</p>
      <RailCard>
        <RailRows>
          {results.map((r) => (
            <div key={r.matchupId} data-testid="recap-result" className="space-y-1.5">
              <ScoreLine team={r.winner} won />
              <ScoreLine team={r.loser} won={false} />
            </div>
          ))}
        </RailRows>
      </RailCard>
    </section>
  );
}

/** One side of a final: W/L glyph, crest and name, then the score. Winners
 * are bold ink, losers regular tertiary, per the W/L typographic rule. */
function ScoreLine({ team, won }: { team: RecapTeam; won: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 text-body-sm ${
        won ? "font-semibold text-text-primary" : "text-text-tertiary"
      }`}
    >
      <span
        className={`text-caption w-3 shrink-0 ${won ? "text-accent-green" : "text-accent-warm"}`}
      >
        {won ? "W" : "L"}
      </span>
      <TeamFlag team={team} />
      <span className="ml-auto text-stat tabular-nums shrink-0">{team.points.toFixed(1)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team of the Week (league-wide optimal lineup)
// ---------------------------------------------------------------------------

function TeamOfWeekCard({ team }: { team: TeamOfWeek }) {
  return (
    <section className="space-y-4">
      <p className="text-kicker">Team of the Week &middot; Optimal Lineup</p>
      <RailCard tinted>
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-kicker text-accent-gold">Best Possible Lineup</p>
          <p className="text-stat tabular-nums text-[32px] leading-none text-text-primary">
            {team.total.toFixed(1)}
          </p>
        </div>
        <p className="mt-2 text-body-sm text-text-secondary">{teamOfWeekVerdict(team)}</p>
        <div className="mt-5">
          <RailRows>
            {team.slots.map((s, i) => (
              <div
                key={`${s.slot}-${i}`}
                data-testid="totw-slot"
                className="flex items-center gap-3"
              >
                <span className="text-kicker w-12 shrink-0">{slotLabel(s.slot)}</span>
                {s.player ? (
                  <RecapPlayerRow player={s.player} size={40} flagBenched />
                ) : (
                  <span className="text-body-sm text-text-muted">Empty</span>
                )}
              </div>
            ))}
          </RailRows>
        </div>
      </RailCard>
    </section>
  );
}

function slotLabel(slot: string): string {
  if (slot === "SUPER_FLEX") return "SFLEX";
  return slot;
}

// ---------------------------------------------------------------------------
// Top performers + the dud
// ---------------------------------------------------------------------------

function TopPerformersCard({ players }: { players: RecapPlayer[] }) {
  return (
    <section className="space-y-4">
      <p className="text-kicker">Top Performers &middot; Started</p>
      <RailCard>
        <RailRows>
          {players.map((p, i) => (
            <div key={p.playerId} data-testid="recap-top" className="flex items-center gap-3">
              <span className="text-stat tabular-nums text-body-sm text-text-tertiary w-5 shrink-0">
                {i + 1}
              </span>
              <RecapPlayerRow player={p} size={48} />
            </div>
          ))}
        </RailRows>
      </RailCard>
    </section>
  );
}

function DudCard({ player }: { player: RecapPlayer }) {
  return (
    <section className="space-y-4">
      <p className="text-kicker">Dud of the Week</p>
      <div className="card-surface relative overflow-hidden p-6 card-tint-warm">
        <p className="text-kicker text-accent-warm">
          {SNARKY_LABELS.NO_SHOW.displayText} &middot; Started Anyway
        </p>
        <div className="mt-3">
          <RecapPlayerRow player={player} size={48} tone="warm" />
        </div>
        {player.projectedPoints != null && player.projectedPoints > 0 && (
          <p className="mt-3 text-body-sm text-text-secondary">
            Projected for{" "}
            <span className="text-stat tabular-nums">{player.projectedPoints.toFixed(1)}</span>
            . Delivered{" "}
            <span className="text-stat tabular-nums text-accent-warm">
              {player.points.toFixed(1)}
            </span>
            .
          </p>
        )}
      </div>
    </section>
  );
}

/** Headshot, name, NFL team and position, the rostering franchise, and the
 * week's points. The franchise crest rides on the headshot; the name is
 * visible text so the crest stays decorative. Not a <p> host: PlayerHeadshot
 * and FranchiseLogo both render divs. */
function RecapPlayerRow({
  player,
  size,
  tone = "ink",
  flagBenched = false,
}: {
  player: RecapPlayer;
  size: number;
  tone?: "ink" | "warm";
  flagBenched?: boolean;
}) {
  const benched = flagBenched && !player.started;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <PlayerLink playerId={player.playerId} className="flex min-w-0 flex-1 items-center gap-3">
        <PlayerHeadshot
          playerId={player.playerId}
          name={player.name}
          size={size}
          nflTeam={player.nflTeam}
          franchiseBadge={{
            slug: player.franchiseSlug,
            name: player.franchiseName,
            abbreviation: player.franchiseAbbreviation,
            brandingColor: player.franchiseBrandingColor,
            avatarUrl: player.franchiseAvatarUrl,
          }}
          decorative
        />
        <span className="min-w-0 flex-1">
          <span className="text-body-sm font-semibold text-text-primary truncate block">
            {player.name}
          </span>
          <span className="text-caption text-text-tertiary truncate block">
            {benched && <span className="text-accent-warm">Benched &middot; </span>}
            {player.nflTeam ?? "FA"} &middot; {player.position ?? "?"} &middot;{" "}
            {player.franchiseName}
          </span>
        </span>
      </PlayerLink>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden sm:inline-block">
          <PositionBadge position={player.position} />
        </span>
        <span
          className={`text-stat tabular-nums text-body ${
            tone === "warm" ? "text-accent-warm" : "text-text-primary"
          }`}
        >
          {player.points.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left On The Bench (moved here from between-weeks-hub.tsx; same copy)
// ---------------------------------------------------------------------------

export function BenchCallout({ leader }: { leader: WeekBenchLeader }) {
  const winTail =
    leader.won === true
      ? " And still won."
      : leader.won === false
        ? " And still lost."
        : "";
  return (
    <section className="space-y-4">
      <p className="text-kicker">Left On The Bench</p>
      <RailCard tinted>
        <p className="text-kicker text-accent-gold">
          {SNARKY_LABELS.COACHING_MALPRACTICE.displayText} &middot; Optimal Lineup
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
    </section>
  );
}
