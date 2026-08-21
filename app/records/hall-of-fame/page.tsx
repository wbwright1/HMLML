import Link from "next/link";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { BackLink } from "@/components/back-link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { ScrollReveal } from "@/components/scroll-reveal";
import { EmptyState } from "@/components/empty-state";
import { PlayerLoreCards } from "@/components/player-lore-cards";
import { TrophyCase } from "@/components/trophy-case";
import { getGoatLadder, GOAT_WEIGHTS, type GoatEntry } from "@/lib/queries/goat";
import { GOAT_ARCHETYPE_LABELS } from "@/lib/goat-content";
import { getAllToiletBowlChampions } from "@/lib/queries/playoff-bracket";
import { TOILET_BOWL_COPY } from "@/lib/playoff-labels";
import { SNARKY_LABELS } from "@/lib/content";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export const metadata = {
  title: "The Hall of Fame & Shame | Harambe Memorial League Memorial League",
  description:
    "Every franchise ranked 1 to 12, all-time, plus the players who wrote the legend. Rings, records, and receipts, settled by one composite score.",
};

function record(e: GoatEntry): string {
  return e.ties > 0
    ? `${e.wins}-${e.losses}-${e.ties}`
    : `${e.wins}-${e.losses}`;
}

/** A labeled stat cell: mono numeral over a caption. */
function Stat({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: "gold" | "warm" | "muted";
}) {
  const valueColor =
    accent === "gold"
      ? "text-accent-gold"
      : accent === "warm"
        ? "text-accent-warm"
        : "text-text-primary";
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`font-mono text-body font-bold tabular-nums leading-none ${valueColor}`}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </span>
    </div>
  );
}

/** Rings chip: gold when > 0 (labeled), dim "no rings" otherwise. */
function RingsChip({ count }: { count: number }) {
  if (count <= 0) {
    return (
      <span className="text-caption text-text-muted uppercase tracking-[0.08em]">
        No rings
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-gold-light px-2.5 py-1 text-caption font-semibold text-accent-gold uppercase tracking-[0.08em]">
      <span aria-hidden>◆</span>
      {count} {count === 1 ? "Ring" : "Rings"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// #1: the throne. Full-width spotlight with gold treatment + ambient glows.
// ---------------------------------------------------------------------------
function GoatHero({ entry }: { entry: GoatEntry }) {
  return (
    <div className="card-surface card-glows relative overflow-hidden border-accent-gold/25 p-6 md:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center">
        <div className="flex items-center gap-5">
          <span className="font-mono text-[56px] md:text-[76px] font-bold leading-none tabular-nums text-accent-gold">
            01
          </span>
          <Link href={`/teams/${entry.slug}`} className="shrink-0">
            <FranchiseLogo
              slug={entry.slug}
              name={entry.name}
              abbreviation={entry.abbreviation}
              brandingColor={entry.brandingColor}
              avatarUrl={entry.avatarUrl}
              size="xl"
            />
          </Link>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-kicker text-accent-gold mb-1.5">
            {GOAT_ARCHETYPE_LABELS[entry.archetype]}
          </p>
          <Link href={`/teams/${entry.slug}`}>
            <h2 className="text-h2 text-text-primary transition-colors hover:text-accent-gold">
              {entry.name}
            </h2>
          </Link>
          <p className="text-body-lg text-text-secondary mt-2 max-w-prose">
            {entry.blurb}
          </p>
          <div className="mt-5 space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[44px] md:text-[52px] font-bold leading-none tabular-nums text-accent-gold">
                  {(entry.goatScore * 100).toFixed(1)}
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                  GOAT Index
                </span>
              </div>
              <RingsChip count={entry.championships} />
            </div>
            <div className="grid grid-cols-3 gap-3 border-t border-divider pt-4">
              <Stat value={record(entry)} label="All-time" accent="gold" />
              <Stat
                value={`${(entry.winPct * 100).toFixed(1)}%`}
                label="Win rate"
              />
              <Stat
                value={`${entry.playoffAppearances}/${entry.seasonsPlayed}`}
                label="Playoffs"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A standard ladder row (#2..#N-1) and the #N Sting row share this shell; the
// `sting` flag flips the tint and the archetype color to warm rust.
// ---------------------------------------------------------------------------
function GoatRow({ entry, sting }: { entry: GoatEntry; sting?: boolean }) {
  return (
    <div
      className={`rounded-[14px] border p-4 md:p-5 transition-colors ${
        sting
          ? "border-accent-warm/25 bg-accent-warm-light hover:border-accent-warm/40"
          : "border-border bg-surface hover:border-border-strong hover:bg-surface-muted"
      }`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`w-8 shrink-0 text-center font-mono text-[26px] md:text-[30px] font-bold leading-none tabular-nums ${
            sting ? "text-accent-warm" : "text-text-tertiary"
          }`}
        >
          {String(entry.rank).padStart(2, "0")}
        </span>
        <Link href={`/teams/${entry.slug}`} className="shrink-0">
          <FranchiseLogo
            slug={entry.slug}
            name={entry.name}
            abbreviation={entry.abbreviation}
            brandingColor={entry.brandingColor}
            avatarUrl={entry.avatarUrl}
            size="md"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <p
            className={`text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5 ${
              sting ? "text-accent-warm" : "text-text-tertiary"
            }`}
          >
            {GOAT_ARCHETYPE_LABELS[entry.archetype]}
          </p>
          <Link href={`/teams/${entry.slug}`}>
            <p className="text-h3 text-text-primary transition-colors hover:text-accent-gold truncate">
              {entry.name}
            </p>
          </Link>
          <p className="text-body-sm text-text-secondary mt-1 hidden sm:block">
            {entry.blurb}
          </p>
        </div>

        {/* Stats: hidden on the smallest screens, shown from sm up. */}
        <div className="hidden sm:flex items-end gap-6 shrink-0">
          <Stat value={record(entry)} label="Record" />
          <Stat
            value={entry.championships > 0 ? `${entry.championships}` : "0"}
            label={entry.championships === 1 ? "Ring" : "Rings"}
            accent={entry.championships > 0 ? "gold" : "muted"}
          />
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0 pl-2">
          <span
            className={`font-mono text-h3 font-bold tabular-nums leading-none ${
              sting ? "text-accent-warm" : "text-text-primary"
            }`}
          >
            {(entry.goatScore * 100).toFixed(1)}
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary">
            Index
          </span>
        </div>
      </div>

      {/* Blurb wraps under the row on mobile where the inline copy is hidden. */}
      <p className="text-body-sm text-text-secondary mt-3 sm:hidden">
        {entry.blurb}
      </p>
    </div>
  );
}

export default async function HallOfFamePage() {
  let ladder: GoatEntry[] = [];
  try {
    ladder = await getGoatLadder();
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB may not be connected in dev.
  }

  const toiletBowlChampions = await getAllToiletBowlChampions();

  if (ladder.length === 0) {
    return (
      <>
        <BackLink href="/records" label="Records" />
        <EmptyState
          icon="trophy"
          title="No Hall Yet"
          description="The Hall of Fame ranks every franchise once season history has been synced from Sleeper."
          actionLabel="Browse records"
          actionHref="/records"
        />
      </>
    );
  }

  const goat = ladder[0];
  const middle = ladder.slice(1, ladder.length - 1);
  const doormat = ladder.length > 1 ? ladder[ladder.length - 1] : null;

  const weightLine = [
    `${Math.round(GOAT_WEIGHTS.careerWinPct * 100)}% career win rate`,
    `${Math.round(GOAT_WEIGHTS.championships * 100)}% championships`,
    `${Math.round(GOAT_WEIGHTS.playoffRate * 100)}% playoff rate`,
    `${Math.round(GOAT_WEIGHTS.careerPoints * 100)}% all-time points`,
    `${Math.round(GOAT_WEIGHTS.recentForm * 100)}% recent form`,
  ].join(", ");

  return (
    <>
      <section className="pt-8 pb-2 md:pt-12 space-y-4">
        <BackLink href="/records" label="Records" />
        <div className="space-y-2">
          <p className="text-kicker">All-Time · Enshrined</p>
          <h1 className="text-display">The Hall of Fame &amp; Shame.</h1>
          <p className="text-body-lg text-text-secondary max-w-prose">
            Every franchise ranked, every legend on the record, and a
            basement nobody can climb out of. The receipts are permanent.
          </p>
        </div>
      </section>

      {/* The GOAT Ladder: the all-time franchise ranking, kept as a titled
          module within the Hall rather than folded into a flat page. */}
      <section className="pb-12 md:pb-16 space-y-3">
        <div className="pb-2">
          <p className="text-kicker text-accent-gold mb-1.5">Module</p>
          <h2 className="text-h2 text-text-primary">The GOAT Ladder</h2>
          <p className="text-body-sm text-text-tertiary mt-1">
            Every franchise, ranked 1 to {ladder.length} by one composite
            score. Somebody has to be last.
          </p>
        </div>

        <ScrollReveal>
          <GoatHero entry={goat} />
        </ScrollReveal>

        {middle.map((entry, i) => (
          <ScrollReveal key={entry.franchiseId} delay={(i + 1) * 40}>
            <GoatRow entry={entry} />
          </ScrollReveal>
        ))}

        {doormat && (
          <ScrollReveal delay={(middle.length + 1) * 40}>
            <GoatRow entry={doormat} sting />
          </ScrollReveal>
        )}

        {/* Methodology footnote: keeps the roast arguable, not arbitrary. */}
        <p className="text-caption text-text-muted normal-case tracking-normal pt-4 max-w-prose">
          Methodology: the GOAT Index blends {weightLine}. Championships and
          all-time points are normalized across the league; win rate, playoff
          rate, and recent form are rates already. Recent form weights the last
          three seasons toward the most recent. Only completed seasons count.
        </p>
      </section>

      {/* The Shame Wing: the receipts nobody frames. One entry per season's
          Toilet Bowl champion, read straight off
          seasons.toilet_bowl_franchise_id. Renders nothing until a losers
          bracket final has actually been played. */}
      {toiletBowlChampions.length > 0 && (
        <section
          data-testid="hall-of-shame-toilet-bowl"
          className="pb-12 md:pb-16 space-y-3"
        >
          <div className="pb-2">
            <p className="text-kicker text-accent-warm mb-1.5">Module</p>
            <h2 className="text-h2 text-text-primary">The Basement</h2>
            <p className="text-body-sm text-text-tertiary mt-1">
              {TOILET_BOWL_COPY.explainer} These are the franchises that got
              there.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {toiletBowlChampions.map((champion, i) => (
              <ScrollReveal key={champion.seasonYear} delay={i * 40}>
                <Link
                  href={`/playoffs/${champion.seasonYear}`}
                  className="card-surface card-tint-warm flex h-full items-center gap-3 p-4 transition-colors hover:border-border-strong"
                >
                  <FranchiseLogo
                    slug={champion.franchiseSlug}
                    name={champion.franchiseName}
                    abbreviation={champion.franchiseAbbreviation ?? undefined}
                    brandingColor={champion.franchiseBrandingColor ?? undefined}
                    avatarUrl={champion.avatarUrl}
                    size="md"
                    decorative
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-body font-bold tabular-nums leading-none text-accent-warm">
                      {champion.seasonYear}
                    </p>
                    <p className="truncate text-body-sm text-text-primary mt-1">
                      {champion.franchiseName}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-text-tertiary mt-0.5">
                      {SNARKY_LABELS.TOILET_BOWL_CHAMPION.displayText}
                    </p>
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </section>
      )}

      {/* The Player Wing: the hardware and the legends behind it, in one
          module. Yearly Hardware (commissioner-decided season honors: MVP /
          Finals MVP / Rookie of the Year) leads, followed by League Lore
          (the Wanderer / Waiver Yo-Yo / League Cornerstone callouts). Either
          subsection can render nothing on its own until its underlying data
          is seeded/synced. */}
      <section className="pb-12 md:pb-16 space-y-8">
        <div className="pb-2">
          <p className="text-kicker text-accent-gold mb-1.5">Module</p>
          <h2 className="text-h2 text-text-primary">The Player Wing</h2>
          <p className="text-body-sm text-text-tertiary mt-1">
            The hardware handed out and the legends who earned it.
          </p>
        </div>

        <TrophyCase />

        <div className="space-y-3">
          <div className="pb-1">
            <p className="text-kicker text-accent-gold mb-1.5">League Lore</p>
            <h3 className="text-h3 text-text-primary">
              Twelve Legends and Cautionary Tales
            </h3>
            <p className="text-body-sm text-text-tertiary mt-1">
              The best single game at every position, the steals, the busts,
              and the seasons that wrote themselves into the record.
            </p>
          </div>
          <PlayerLoreCards />
        </div>
      </section>
    </>
  );
}
