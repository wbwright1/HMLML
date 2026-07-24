import { notFound } from "next/navigation";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import {
  FranchiseSignatureBand,
  type SignatureCallout,
} from "@/components/franchise-signature-band";
import {
  FranchiseH2HGrid,
  type H2HGridRow,
} from "@/components/franchise-h2h-grid";
import { getFranchiseBySlug } from "@/lib/queries/franchises";
import { getRivalries } from "@/lib/queries/records";
import { getFranchiseExtremes } from "@/lib/queries/franchise-stats";
import { getFranchiseCornerstone } from "@/lib/queries/franchise-players";
import { getPlayoffLabel, getPlayoffBadgeVariant } from "@/lib/playoff-labels";
import { EmptyState } from "@/components/empty-state";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export const dynamic = "force-dynamic";

interface FranchiseDetailPageProps {
  params: Promise<{ franchiseSlug: string }>;
}

export async function generateMetadata({ params }: FranchiseDetailPageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;
  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    return { title: "Franchise Not Found | Harambe Memorial League Memorial League" };
  }

  return {
    title: `${franchise.name} | Harambe Memorial League Memorial League`,
    description: `Career history and stats for ${franchise.name} in the Harambe Memorial League Memorial League.`,
  };
}

export default async function FranchiseDetailPage({
  params,
}: FranchiseDetailPageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;

  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    notFound();
  }

  // Determine current owner from most recent season
  const currentOwner =
    franchise.seasonHistory.length > 0
      ? franchise.seasonHistory[0].ownerDisplayName
      : undefined;

  const currentCoOwner =
    franchise.seasonHistory.length > 0
      ? franchise.seasonHistory[0].coOwnerDisplayName
      : undefined;

  // Win percentage
  const totalGames = franchise.totalWins + franchise.totalLosses;
  const winPct = totalGames > 0 ? (franchise.totalWins / totalGames) : 0;

  // --- Signature band + "Who Owns Who" data ---------------------------------
  let rivalries: Awaited<ReturnType<typeof getRivalries>> = [];
  let extremes: Awaited<ReturnType<typeof getFranchiseExtremes>> = {
    worstBeatdown: null,
    longestWinStreak: 0,
  };
  let cornerstones: Awaited<ReturnType<typeof getFranchiseCornerstone>> = [];
  try {
    [rivalries, extremes, cornerstones] = await Promise.all([
      getRivalries(),
      getFranchiseExtremes(franchise.id),
      getFranchiseCornerstone(franchise.id),
    ]);
  } catch {
    // DB may not be connected in dev
  }

  // Normalize every rivalry to THIS franchise's perspective. getRivalries is
  // sorted by most games played first, so the first match is the primary rival.
  const myRivalries = rivalries
    .filter(
      (r) => r.franchiseA.id === franchise.id || r.franchiseB.id === franchise.id
    )
    .map((r) => {
      const iAmA = r.franchiseA.id === franchise.id;
      const opponent = iAmA ? r.franchiseB : r.franchiseA;
      const wins = iAmA ? r.record.wins : r.record.losses;
      const losses = iAmA ? r.record.losses : r.record.wins;
      const ties = r.record.ties;
      const total = wins + losses + ties;
      return {
        opponent,
        wins,
        losses,
        ties,
        winPct: total > 0 ? wins / total : 0,
        totalGames: r.totalGames,
      };
    });

  const primaryRival = myRivalries[0];

  // Best-to-worst grid, tagging only the genuinely lopsided extremes.
  const gridRows: H2HGridRow[] = [...myRivalries]
    .sort((a, b) => {
      if (b.winPct !== a.winPct) return b.winPct - a.winPct;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.losses - b.losses;
    })
    .map((r, i, arr) => {
      let tag: H2HGridRow["tag"] = null;
      if (i === 0 && r.wins > r.losses) tag = "OWNS";
      else if (i === arr.length - 1 && r.losses > r.wins) tag = "OWNED BY";
      return {
        opponent: {
          name: r.opponent.name,
          slug: r.opponent.slug,
          abbreviation: r.opponent.abbreviation,
          brandingColor: r.opponent.brandingColor,
          avatarUrl: r.opponent.avatarUrl,
        },
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        winPct: r.winPct,
        tag,
      };
    });

  // Best regular-season finish (lowest standings number; tiebreak most recent).
  let bestFinish: { finish: number; year: number } | null = null;
  for (const s of franchise.seasonHistory) {
    if (s.standingsFinish == null) continue;
    if (bestFinish === null || s.standingsFinish < bestFinish.finish) {
      bestFinish = { finish: s.standingsFinish, year: s.seasonYear };
    }
  }

  // Assemble the signature callouts (curated, screenshot-worthy).
  const callouts: SignatureCallout[] = [];

  if (totalGames > 0) {
    callouts.push({
      kicker: "All-Time Record",
      value: `${franchise.totalWins}-${franchise.totalLosses}`,
      subline: `${(winPct * 100).toFixed(1)}% win rate across ${franchise.seasonHistory.length} season${franchise.seasonHistory.length !== 1 ? "s" : ""}.`,
      tone: winPct >= 0.5 ? "gold" : "sting",
    });
  }

  callouts.push(
    franchise.championships > 0
      ? {
          kicker: "Hardware",
          value: franchise.championships,
          subline: `Championship${franchise.championships !== 1 ? "s" : ""}. The trophy case earns its keep.`,
          tone: "gold",
        }
      : {
          kicker: "Hardware",
          value: 0,
          subline: "Rings. The trophy case is collecting dust.",
          tone: "sting",
        }
  );

  if (bestFinish) {
    callouts.push({
      kicker: "Best Finish",
      value: ordinal(bestFinish.finish),
      subline:
        bestFinish.finish === 1
          ? `Top of the standings in ${bestFinish.year}.`
          : `Peaked in ${bestFinish.year}.`,
      tone: bestFinish.finish <= 3 ? "gold" : "neutral",
    });
  }

  if (extremes.worstBeatdown) {
    const b = extremes.worstBeatdown;
    callouts.push({
      kicker: "Worst Beatdown",
      value: `-${b.margin.toFixed(1)}`,
      subline: `${b.pointsFor.toFixed(1)}–${b.pointsAgainst.toFixed(1)} vs ${b.opponentName}, ${b.seasonYear}.`,
      tone: "sting",
    });
  }

  if (primaryRival) {
    callouts.push({
      kicker: "Primary Rival",
      value: `${primaryRival.wins}-${primaryRival.losses}`,
      subline: `${primaryRival.opponent.name} · ${primaryRival.totalGames} meeting${primaryRival.totalGames !== 1 ? "s" : ""}.`,
      tone:
        primaryRival.wins > primaryRival.losses
          ? "gold"
          : primaryRival.wins < primaryRival.losses
            ? "sting"
            : "neutral",
    });
  }

  // Franchise Cornerstone(s): the player(s) drafted or traded for and never
  // let go, scored by points in this franchise's colors. See
  // lib/queries/franchise-players.ts for eligibility/scoring rules.
  const apYear = (year: number) => `'${String(year).slice(-2)}`;
  const lastName = (fullName: string) => fullName.trim().split(/\s+/).slice(-1)[0] ?? fullName;

  if (cornerstones.length === 1) {
    const c = cornerstones[0];
    const verb =
      c.via === "draft"
        ? "Drafted"
        : c.blockbuster === true
          ? "Blockbuster trade,"
          : "Traded for";
    const seasonsPhrase = `${c.tenureSeasons} season${c.tenureSeasons !== 1 ? "s" : ""} and counting`;
    callouts.push({
      kicker: "Franchise Cornerstone",
      value: c.playerName,
      subline: `${verb} ${apYear(c.acquiredYear)} · ${Math.round(c.franchisePoints).toLocaleString()} pts · ${c.franchiseStarts} starts · ${seasonsPhrase}.`,
      tone: "gold",
    });
  } else if (cornerstones.length === 2) {
    const [a, b] = cornerstones;
    const combinedPts = Math.round(a.franchisePoints + b.franchisePoints);
    const sameOrigin = a.via === b.via && a.acquiredYear === b.acquiredYear;
    const subline = sameOrigin
      ? `Both ${a.via === "draft" ? "drafted" : "traded for"} ${apYear(a.acquiredYear)} · ${combinedPts.toLocaleString()} pts combined.`
      : `Since ${apYear(a.acquiredYear)} and ${apYear(b.acquiredYear)} · ${combinedPts.toLocaleString()} pts combined.`;
    callouts.push({
      kicker: "Franchise Cornerstones",
      value: `${lastName(a.playerName)} · ${lastName(b.playerName)}`,
      subline,
      tone: "gold",
    });
  }

  return (
    <>
      {/* Hero Section — dark canvas frame; brandingColor survives only as a
          subtle ring on the crest (see FranchiseIdentity's BrandedCrest). */}
      <section className="py-8 md:py-12 space-y-6">
        <BackLink href="/teams" label="All Teams" />

        <ScrollReveal>
          <FranchiseIdentity
            franchise={{
              slug: franchise.slug,
              name: franchise.name,
              abbreviation: franchise.abbreviation,
              brandingColor: franchise.brandingColor,
              avatarUrl: franchise.avatarUrl,
            }}
            championships={franchise.championships}
            ownerName={currentOwner ?? undefined}
            coOwnerName={currentCoOwner ?? undefined}
            division={franchise.seasonHistory[0]?.divisionName ?? undefined}
            variant="hero"
          />
        </ScrollReveal>

        {callouts.length > 0 && (
          <ScrollReveal delay={100}>
            <FranchiseSignatureBand callouts={callouts} />
          </ScrollReveal>
        )}

        {franchise.seasonHistory.length > 0 && (
          <ScrollReveal delay={200}>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-center sm:gap-6 pt-2">
              <Link
                href={`/teams/${franchise.slug}/roster`}
                className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
              >
                View Current Roster
              </Link>
              <Link
                href={`/teams/${franchise.slug}/drafts`}
                className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-body-sm font-medium text-text-primary transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
              >
                Draft History
              </Link>
              <Link
                href={`/trades?team=${franchise.slug}`}
                className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-body-sm font-medium text-text-primary transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
              >
                Trade History
              </Link>
              <Link
                href={`/teams/${franchise.slug}/schedule`}
                className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-body-sm font-medium text-text-primary transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto"
              >
                Schedule
              </Link>
            </div>
          </ScrollReveal>
        )}
      </section>

      {/* Season History */}
      <PageSection label="Year by Year" title="Season History">
        {franchise.seasonHistory.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="No Season History"
            description="Season history will appear after data sync completes."
          />
        ) : (
          <div className="space-y-3">
            {franchise.seasonHistory.map((season, index) => (
              <ScrollReveal key={season.id} delay={index * 40}>
                <Link
                  href={`/teams/${franchise.slug}/schedule?season=${season.seasonYear}`}
                  aria-label={`${season.seasonYear} schedule`}
                  className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-muted"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-h3 text-text-primary">
                          {season.seasonYear}
                        </span>
                        {season.isLegacyEra && (
                          <span className="text-caption text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            Legacy Era
                          </span>
                        )}
                      </div>
                      {season.ownerDisplayName && (
                        <p className="text-body-sm text-muted-foreground">
                          {season.ownerDisplayName}{season.coOwnerDisplayName ? ` & ${season.coOwnerDisplayName}` : ""}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm font-mono">
                      {/* Record */}
                      <span className="tabular-nums whitespace-nowrap">
                        <span className="font-bold text-text-primary">{season.wins ?? 0}</span>
                        <span className="text-xs text-muted-foreground ml-0.5">
                          W
                        </span>
                        <span className="text-muted-foreground mx-1">-</span>
                        <span className="text-text-secondary">{season.losses ?? 0}</span>
                        <span className="text-xs text-muted-foreground ml-0.5">
                          L
                        </span>
                        {(season.ties ?? 0) > 0 && (
                          <>
                            <span className="text-muted-foreground mx-1">
                              -
                            </span>
                            <span className="text-text-secondary">{season.ties}</span>
                            <span className="text-xs text-muted-foreground ml-0.5">
                              T
                            </span>
                          </>
                        )}
                      </span>

                      {/* Points scored */}
                      {(season.pointsScored ?? 0) > 0 && (
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                          {(season.pointsScored ?? 0).toFixed(1)} pts
                        </span>
                      )}

                      {/* Standings finish */}
                      {season.standingsFinish != null && (
                        <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                          #{season.standingsFinish}
                        </span>
                      )}

                      {/* Division */}
                      <span className="text-muted-foreground whitespace-nowrap normal-case tracking-normal">
                        {season.divisionName ?? "—"}
                      </span>

                      {/* Playoff result */}
                      <PlayoffBadge result={season.playoffResult} />
                    </div>
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        )}
      </PageSection>

      {/* Who Owns Who — lifetime H2H vs the rest of the league */}
      {gridRows.length > 0 && (
        <PageSection label="Lifetime Head-to-Head" title="Who Owns Who">
          <ScrollReveal>
            <FranchiseH2HGrid
              franchiseSlug={franchise.slug}
              rows={gridRows}
            />
          </ScrollReveal>
        </PageSection>
      )}
    </>
  );
}

function PlayoffBadge({ result }: { result: string | null }) {
  if (!result) return null;

  const label = getPlayoffLabel(result);
  if (!label) return null;

  return (
    <SuperlativeBadge
      text={label}
      variant={getPlayoffBadgeVariant(result)}
    />
  );
}
