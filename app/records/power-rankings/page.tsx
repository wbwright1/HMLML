import Link from "next/link";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import type { PowerRankingEntry } from "@/lib/queries/records";
import {
  getPowerRankingsView,
  type PowerRankingsView,
  type PreseasonPowerEntry,
} from "@/lib/queries/preseason-power";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export const metadata = {
  title: "Power Rankings | Harambe Memorial League Memorial League",
  description:
    "Current season power rankings for the Harambe Memorial League Memorial League.",
};

/** Spots moved since last week's edition: sage ▲ for climbers, rust ▼ for
 * sliders, neutral dash for holding (or Week 1, with nothing to compare). Never
 * color alone; the glyph + value always ride together. */
function MovedIndicator({ delta }: { delta: number | null }) {
  if (!delta) {
    return (
      <span className="flex items-center font-mono text-sm tabular-nums text-text-tertiary">
        <span aria-hidden>–</span>
        <span className="sr-only">
          {delta === null ? "no prior week" : "held position from last week"}
        </span>
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-accent-green">
        <span aria-hidden>▲</span>
        <span>{delta}</span>
        <span className="sr-only">{delta === 1 ? "spot" : "spots"} up from last week</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 font-mono text-sm font-bold tabular-nums text-accent-warm">
      <span aria-hidden>▼</span>
      <span>{Math.abs(delta)}</span>
      <span className="sr-only">{delta === -1 ? "spot" : "spots"} down from last week</span>
    </span>
  );
}

/** W-L(-T) record, mono with muted letter suffixes. */
function Record({
  wins,
  losses,
  ties,
}: {
  wins: number;
  losses: number;
  ties: number;
}) {
  return (
    <span className="font-mono tabular-nums whitespace-nowrap">
      <span className="font-bold text-text-primary">{wins}</span>
      <span className="text-xs text-text-tertiary ml-0.5">W</span>
      <span className="text-text-tertiary mx-1">-</span>
      <span className="text-text-primary">{losses}</span>
      <span className="text-xs text-text-tertiary ml-0.5">L</span>
      {ties > 0 && (
        <>
          <span className="text-text-tertiary mx-1">-</span>
          <span className="text-text-primary">{ties}</span>
          <span className="text-xs text-text-tertiary ml-0.5">T</span>
        </>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Preseason edition helpers
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

const PLAYOFF_RESULT_LABEL: Record<string, string> = {
  champion: "Champ",
  runner_up: "Runner-up",
  made_playoffs: "Playoffs",
  consolation: "Consolation",
  toilet_bowl: "Toilet Bowl",
};

/** Season-long W-L streak, signed (+3 = W3, -2 = L2). Letter + number always
 * ride with the color; a dash when there is no streak. */
function Streak({ value }: { value: number }) {
  if (value === 0) {
    return (
      <span className="font-mono text-sm tabular-nums text-text-tertiary">–</span>
    );
  }
  const winning = value > 0;
  return (
    <span
      className={`font-mono text-sm tabular-nums ${
        winning ? "font-bold text-accent-green" : "text-accent-warm"
      }`}
    >
      {winning ? "W" : "L"}
      {Math.abs(value)}
      <span className="sr-only">
        {winning ? " game win streak" : " game losing streak"}
      </span>
    </span>
  );
}

/** Labeled stat cell: value over a small caption. Fixed-width on desktop so
 * the same column lines up card to card; the mobile strip passes a width of
 * `w-auto` and lets its grid size the cells. */
function StatCell({
  label,
  width = "w-16",
  align = "end",
  tone = "ink",
  children,
}: {
  label: string;
  width?: string;
  align?: "start" | "end";
  /** `gold` marks the row's headline number (the power index). */
  tone?: "ink" | "gold";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col shrink-0 ${width} ${
        align === "end" ? "items-end" : "items-start"
      }`}
    >
      <span
        className={`font-mono text-sm font-bold tabular-nums ${
          tone === "gold" ? "text-accent-gold" : "text-text-primary"
        }`}
      >
        {children}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-text-tertiary whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

/** The gold headline number for a row: the power index itself. */
function PowerIndex({ value }: { value: number }) {
  return (
    <div className="flex flex-col items-end shrink-0 w-16 pl-3 border-l border-divider">
      <span className="font-mono text-lg font-black tabular-nums text-accent-gold">
        {(value * 100).toFixed(1)}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
        Power
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Regular (in-season, last-4-weeks) edition
// ---------------------------------------------------------------------------

function RegularEdition({ rankings }: { rankings: PowerRankingEntry[] }) {
  // The window is min(4, completed weeks); label it honestly in Week 2.
  const windowWeeks = Math.max(0, ...rankings.map((r) => r.windowGames));
  const windowLabel = `Last ${windowWeeks}`;

  return (
    <>
      <PageSection label="Records" title="Power Rankings.">
        <BackLink href="/records" label="All Records" />

        <p className="text-body-lg text-text-secondary max-w-prose">
          Ranked on the last {windowWeeks === 1 ? "week" : `${windowWeeks} weeks`}:
          recent results, scoring trend, and injuries. Not season-long record.
        </p>
      </PageSection>

      <section className="pb-8 md:pb-12 space-y-3 md:space-y-4">
        {rankings.map((entry, index) => {
          const rankColor =
            entry.rank <= 3 ? "text-accent-gold" : "text-text-tertiary";

          const franchise = {
            slug: entry.slug,
            name: entry.name,
            abbreviation: entry.abbreviation,
            brandingColor: entry.brandingColor,
            avatarUrl: entry.avatarUrl,
          };

          // Season context lives under the name so the Moved cell can be a
          // bare glyph: "3W-1L · 2nd in standings".
          const seasonLine = (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-text-tertiary">
              <Record wins={entry.wins} losses={entry.losses} ties={entry.ties} />
              <span aria-hidden>·</span>
              <span className="tabular-nums whitespace-nowrap">
                {ordinal(entry.standingsRank)} in standings
              </span>
              {entry.injuryCount > 0 && (
                <SuperlativeBadge
                  text={`${entry.injuryCount} Banged Up`}
                  variant="brown"
                />
              )}
            </div>
          );

          const windowRecord = (
            <Record
              wins={entry.windowWins}
              losses={entry.windowLosses}
              ties={entry.windowTies}
            />
          );
          const avgPoints = entry.windowAvgPoints.toFixed(1);

          return (
            <ScrollReveal key={entry.id} delay={index * 40}>
              <Link
                href={`/teams/${entry.slug}`}
                className="block rounded-[14px] border border-border bg-surface p-4 md:p-5 transition-colors hover:border-border-strong hover:bg-surface-muted"
              >
                {/* ------- Mobile: stacked card (hidden on md+) ------- */}
                <div className="md:hidden">
                  {/* Row 1: rank · franchise + season line · power index */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-3xl font-black tabular-nums w-9 text-center shrink-0 ${rankColor}`}
                    >
                      {entry.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <FranchiseIdentity
                        franchise={franchise}
                        championships={entry.championships}
                        variant="compact"
                      />
                      {seasonLine}
                    </div>
                  </div>

                  {/* Row 2: window stat strip, power index last */}
                  <div className="mt-3 pt-3 border-t border-divider grid grid-cols-5 gap-2">
                    <StatCell label={windowLabel} width="w-auto" align="start">
                      {windowRecord}
                    </StatCell>
                    <StatCell label="Avg PF" width="w-auto" align="start">
                      {avgPoints}
                    </StatCell>
                    <StatCell label="Streak" width="w-auto" align="start">
                      <Streak value={entry.streak} />
                    </StatCell>
                    <StatCell label="Moved" width="w-auto" align="start">
                      <MovedIndicator delta={entry.rankChange} />
                    </StatCell>
                    <StatCell label="Power" width="w-auto" align="end" tone="gold">
                      {(entry.powerScore * 100).toFixed(1)}
                    </StatCell>
                  </div>
                </div>

                {/* ------- Desktop: single aligned row (hidden below md) ------- */}
                <div className="hidden md:flex md:items-center md:gap-6">
                  {/* Rank */}
                  <span
                    className={`font-mono text-2xl font-black tabular-nums w-10 text-center shrink-0 ${rankColor}`}
                  >
                    {entry.rank}
                  </span>

                  {/* Franchise + season context */}
                  <div className="flex-1 min-w-0">
                    <FranchiseIdentity
                      franchise={franchise}
                      championships={entry.championships}
                      variant="compact"
                    />
                    {seasonLine}
                  </div>

                  {/* Window stats: fixed widths so columns align down the page */}
                  <StatCell label={windowLabel} width="w-20">
                    {windowRecord}
                  </StatCell>
                  <StatCell label="Avg PF" width="w-16">
                    {avgPoints}
                  </StatCell>
                  <StatCell label="Streak" width="w-12">
                    <Streak value={entry.streak} />
                  </StatCell>
                  <StatCell label="Moved" width="w-12">
                    <MovedIndicator delta={entry.rankChange} />
                  </StatCell>
                  <PowerIndex value={entry.powerScore} />
                </div>
              </Link>
            </ScrollReveal>
          );
        })}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Preseason edition (offseason / before Week 1)
// ---------------------------------------------------------------------------

function PreseasonEdition({ rankings }: { rankings: PreseasonPowerEntry[] }) {
  return (
    <>
      <PageSection label="Preseason Power Rankings" title="Power Rankings.">
        <BackLink href="/records" label="All Records" />

        <p className="text-body-lg text-text-secondary max-w-prose">
          No games have kicked off yet, so nobody has a record to hide behind.
          Until real football exists, we rank on what we know: franchise history
          (weighted hard toward last season) plus the projected strength of every
          current roster. Prove us wrong in Week 1.
        </p>
      </PageSection>

      <section className="pb-8 md:pb-12 space-y-3 md:space-y-6">
        {rankings.map((entry, index) => {
          const historyIndex = (entry.historyScore * 100).toFixed(0);
          const rosterIndex = (entry.rosterScore * 100).toFixed(0);

          const finishLabel =
            entry.lastPlayoffResult &&
            PLAYOFF_RESULT_LABEL[entry.lastPlayoffResult]
              ? PLAYOFF_RESULT_LABEL[entry.lastPlayoffResult]
              : entry.lastStandingsFinish
                ? ordinal(entry.lastStandingsFinish)
                : null;

          const isDefendingChamp = entry.lastPlayoffResult === "champion";

          const badges = (
            <>
              {entry.rank === 1 && (
                <SuperlativeBadge text="Preseason #1" variant="green" />
              )}
              {isDefendingChamp && (
                <SuperlativeBadge text="Defending Champ" variant="gold" />
              )}
              {!isDefendingChamp && entry.championships > 0 && (
                <SuperlativeBadge
                  text={`${entry.championships}x Champ`}
                  variant="gold"
                />
              )}
            </>
          );
          const hasBadges =
            entry.rank === 1 || isDefendingChamp || entry.championships > 0;

          const rankColor =
            entry.rank <= 3 ? "text-accent-gold" : "text-text-tertiary";

          const franchise = {
            slug: entry.slug,
            name: entry.name,
            abbreviation: entry.abbreviation,
            brandingColor: entry.brandingColor,
            avatarUrl: entry.avatarUrl,
          };

          const lastSeasonStrip =
            entry.lastSeasonYear !== null ? (
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-text-tertiary tabular-nums">
                  {entry.lastSeasonYear}
                </span>
                <Record
                  wins={entry.lastSeasonWins}
                  losses={entry.lastSeasonLosses}
                  ties={entry.lastSeasonTies}
                />
                {finishLabel && (
                  <span
                    className={`text-xs ${
                      isDefendingChamp ? "text-accent-gold" : "text-text-tertiary"
                    }`}
                  >
                    {finishLabel}
                  </span>
                )}
              </div>
            ) : (
              <span className="font-mono text-xs text-text-tertiary">
                No league history
              </span>
            );

          return (
            <ScrollReveal key={entry.id} delay={index * 40}>
              <Link
                href={`/teams/${entry.slug}`}
                className="block rounded-[14px] border border-border bg-surface p-4 md:p-5 transition-colors hover:border-border-strong hover:bg-surface-muted"
              >
                {/* ------- Mobile: stacked card (hidden on md+) ------- */}
                <div className="md:hidden">
                  {/* Row 1: rank · franchise · power index */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-mono text-3xl font-black tabular-nums w-9 text-center shrink-0 ${rankColor}`}
                    >
                      {entry.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <FranchiseIdentity
                        franchise={franchise}
                        championships={entry.championships}
                        variant="compact"
                      />
                    </div>
                  </div>

                  {/* Row 2: badges */}
                  {hasBadges && (
                    <div className="flex flex-wrap gap-1 mt-3">{badges}</div>
                  )}

                  {/* Row 3: last season */}
                  <div className="mt-3">{lastSeasonStrip}</div>

                  {/* Row 4: component indices, power index last */}
                  <div className="mt-3 pt-3 border-t border-divider grid grid-cols-4 gap-2">
                    <StatCell label="History" width="w-auto" align="start">
                      {historyIndex}
                    </StatCell>
                    <StatCell label="Roster" width="w-auto" align="start">
                      {rosterIndex}
                    </StatCell>
                    <StatCell label="Proj PF" width="w-auto" align="start">
                      {Math.round(entry.rosterProjPoints)}
                    </StatCell>
                    <StatCell label="Power" width="w-auto" align="end" tone="gold">
                      {(entry.powerScore * 100).toFixed(1)}
                    </StatCell>
                  </div>
                </div>

                {/* ------- Desktop: single row (hidden below md) ------- */}
                <div className="hidden md:flex md:items-center md:gap-6">
                  {/* Rank */}
                  <span
                    className={`font-mono text-2xl font-black tabular-nums w-10 text-center shrink-0 ${rankColor}`}
                  >
                    {entry.rank}
                  </span>

                  {/* Franchise */}
                  <div className="flex-1 min-w-0">
                    <FranchiseIdentity
                      franchise={franchise}
                      championships={entry.championships}
                      variant="compact"
                    />
                    <div className="mt-1">{lastSeasonStrip}</div>
                    {hasBadges && (
                      <div className="flex flex-wrap gap-1 mt-1">{badges}</div>
                    )}
                  </div>

                  {/* Component indices */}
                  <StatCell label="History" width="w-14">
                    {historyIndex}
                  </StatCell>
                  <StatCell label="Roster" width="w-14">
                    {rosterIndex}
                  </StatCell>
                  <StatCell label="Proj PF" width="w-14">
                    {Math.round(entry.rosterProjPoints)}
                  </StatCell>
                  <PowerIndex value={entry.powerScore} />
                </div>
              </Link>
            </ScrollReveal>
          );
        })}
      </section>
    </>
  );
}

export default async function PowerRankingsPage() {
  let view: PowerRankingsView = { mode: "regular", entries: [] };

  try {
    view = await getPowerRankingsView();
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB may not be connected
  }

  if (view.entries.length === 0) {
    return (
      <>
        <PageSection label="Records" title="Power Rankings.">
          <BackLink href="/records" label="All Records" />
        </PageSection>
        <section className="pb-8 md:pb-12">
          <EmptyState
            icon="chart"
            title="No Power Rankings"
            description="Rankings appear once franchises and rosters are in the system."
          />
        </section>
      </>
    );
  }

  if (view.mode === "preseason") {
    return <PreseasonEdition rankings={view.entries} />;
  }

  return <RegularEdition rankings={view.entries} />;
}
