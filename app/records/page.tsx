import Link from "next/link";
import {
  ArrowLeftRight,
  Award,
  CalendarDays,
  ChevronRight,
  Flame,
  History,
  Receipt,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { PageSection } from "@/components/page-section";
import { SectionHeader } from "@/components/section-header";
import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";
import {
  getLeaderboard,
  getSeasonYears,
  getAllSeasonLeaderboards,
} from "@/lib/queries/records";
import {
  getPowerRankingsView,
  type PowerRankingsView,
} from "@/lib/queries/preseason-power";
import { getLatestSeason } from "@/lib/queries/matchups";
import { getAllSeasons } from "@/lib/queries/seasons";
import {
  getSeasonSuperlativeCards,
  getAllTimeSuperlativeCards,
  type SeasonSuperlative,
} from "@/lib/queries/superlatives";
import { getPlayoffProjection } from "@/lib/queries/divisions";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { RecordsSeasonView } from "@/app/records/records-season-view";
import type { LeaderboardEntry } from "@/lib/queries/records";
import type { PlayoffProjection } from "@/lib/queries/divisions";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

export const metadata = {
  title: "Records & Rankings | Harambe Memorial League Memorial League",
  description:
    "All-time leaderboard, head-to-head records, rivalries, and trophy case for the Harambe Memorial League Memorial League.",
};

const subPages: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    href: "/records/hall-of-fame",
    label: "Hall of Fame and Shame",
    description: "Every franchise ranked, all-time",
    icon: Trophy,
  },
  {
    href: "/records/head-to-head",
    label: "Head-to-head",
    description: "Any two franchises, every meeting",
    icon: ArrowLeftRight,
  },
  {
    href: "/records/rivalries",
    label: "Rivalries",
    description: "The closest and most played matchups",
    icon: Flame,
  },
  {
    href: "/records/power-rankings",
    label: "Power rankings",
    description: "This season, ranked with context",
    icon: TrendingUp,
  },
  {
    href: "/records/trophies",
    label: "Trophy case",
    description: "Every champion in league history",
    icon: Award,
  },
  {
    href: "/trades",
    label: "Trades",
    description: "Every trade, graded once the results are in",
    icon: Receipt,
  },
  {
    href: "/history",
    label: "History",
    description: "The full season-by-season timeline",
    icon: History,
  },
  {
    href: "/seasons",
    label: "Seasons",
    description: "Standings and champions by year",
    icon: CalendarDays,
  },
];

interface RecordBookEntry {
  label: string;
  value: string;
  context: string;
  contextSlug?: string;
}

/**
 * Derives "Record Book" stat cards from the already-fetched all-time
 * leaderboard rows (no new queries). Career-level records the leaderboard
 * already knows (most wins, most titles, career PF, best win%), rather than
 * game-level records (single-game high score, biggest blowout) that would
 * require a new query and are intentionally omitted.
 */
function buildRecordBook(data: LeaderboardEntry[]): RecordBookEntry[] {
  if (data.length === 0) return [];
  const entries: RecordBookEntry[] = [];

  const mostWins = [...data].sort((a, b) => b.wins - a.wins)[0];
  if (mostWins && mostWins.wins > 0) {
    entries.push({
      label: "Most wins",
      value: String(mostWins.wins),
      context: mostWins.name,
      contextSlug: mostWins.slug,
    });
  }

  const mostTitles = [...data].sort(
    (a, b) => b.championships - a.championships
  )[0];
  if (mostTitles && mostTitles.championships > 0) {
    entries.push({
      label: "Most titles",
      value: `${mostTitles.championships}x`,
      context: mostTitles.name,
      contextSlug: mostTitles.slug,
    });
  }

  const mostPF = [...data].sort((a, b) => b.pointsScored - a.pointsScored)[0];
  if (mostPF && mostPF.pointsScored > 0) {
    entries.push({
      label: "Career PF leader",
      value: mostPF.pointsScored.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      }),
      context: mostPF.name,
      contextSlug: mostPF.slug,
    });
  }

  const eligible = data.filter((d) => d.wins + d.losses + d.ties > 0);
  const bestWinPct = [...eligible].sort((a, b) => b.winPct - a.winPct)[0];
  if (bestWinPct) {
    entries.push({
      label: "Best win %",
      value: `${(bestWinPct.winPct * 100).toFixed(1)}%`,
      context: bestWinPct.name,
      contextSlug: bestWinPct.slug,
    });
  }

  return entries.slice(0, 4);
}

function RecordBookCard({ label, value, context, contextSlug }: RecordBookEntry) {
  return (
    <div className="card-surface p-4">
      <p className="text-kicker text-accent-gold mb-2">{label}</p>
      <p className="text-stat text-h2 leading-none text-text-primary">
        {value}
      </p>
      <div className="text-body-sm text-text-secondary mt-2 truncate">
        <TeamLink slug={contextSlug}>{context}</TeamLink>
      </div>
    </div>
  );
}

/** Compact rank · crest · name row for the inline Power Ranking module, with a
 * mode-specific trailing indicator (trend arrow in-season, power index
 * preseason). */
function PowerMiniRow({
  rank,
  slug,
  name,
  abbreviation,
  brandingColor,
  avatarUrl,
  trailing,
}: {
  rank: number;
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl: string | null;
  trailing: React.ReactNode;
}) {
  return (
    <Link
      href={`/teams/${slug}`}
      className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 transition-[background-color,scale] duration-150 hover:bg-surface-muted active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
    >
      <span className="font-mono text-sm tabular-nums text-text-tertiary w-4 shrink-0">
        {rank}
      </span>
      <FranchiseLogo
        slug={slug}
        name={name}
        abbreviation={abbreviation}
        brandingColor={brandingColor}
        avatarUrl={avatarUrl}
        size="sm"
        decorative
      />
      <span className="text-body-sm font-medium text-text-primary truncate flex-1">
        {name}
      </span>
      {trailing}
    </Link>
  );
}

export default async function RecordsPage() {
  let allTimeData: LeaderboardEntry[] = [];
  let seasonYears: number[] = [];
  let powerView: PowerRankingsView = { mode: "regular", entries: [] };
  const seasonDataRecord: Record<string, LeaderboardEntry[]> = {};
  let projection: PlayoffProjection | null = null;
  let projectionSeasonYear: number | null = null;
  let latestSeason: Awaited<ReturnType<typeof getLatestSeason>> = null;

  try {
    // These are mutually independent; fetch them concurrently rather than in
    // series so the page waits on one round trip instead of several.
    let allSeasonData: Awaited<ReturnType<typeof getAllSeasonLeaderboards>>;
    [allTimeData, seasonYears, powerView, allSeasonData, latestSeason] =
      await Promise.all([
        getLeaderboard(),
        getSeasonYears(),
        getPowerRankingsView(),
        getAllSeasonLeaderboards(),
        getLatestSeason(),
      ]);

    // Batch-fetch all season leaderboards in a single query
    for (const [year, data] of Object.entries(allSeasonData)) {
      seasonDataRecord[year] = data;
    }

    // The playoff projection, for the current season only; hasDivisions gates
    // whether that block renders at all (RISK-B: nothing worth showing for a
    // legacy/no-division season, or when there's no current season).
    if (latestSeason) {
      projection = await getPlayoffProjection(latestSeason.id);
      projectionSeasonYear = latestSeason.seasonYear;
    }
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB may not be connected
  }

  // Hide the newest season's standings tab while it's nothing but 0-0 rows
  // (the whole offseason/preseason window, once next year's season row
  // exists but before Week 1 has been played). An all-zero tab is noise, not
  // a real standings view; all-time and completed seasons are unaffected.
  if (latestSeason) {
    const latestSeasonRows = seasonDataRecord[String(latestSeason.seasonYear)];
    const latestSeasonHasNoGames =
      latestSeasonRows != null &&
      latestSeasonRows.every(
        (e) => e.wins === 0 && e.losses === 0 && e.ties === 0
      );
    if (latestSeasonHasNoGames) {
      seasonYears = seasonYears.filter((y) => y !== latestSeason!.seasonYear);
      delete seasonDataRecord[String(latestSeason.seasonYear)];
    }
  }

  // Season-scoped + all-time superlative cards, keyed for the client tab
  // state to look up by whichever season is selected. Built from the final
  // (post-filter) seasonYears list, so a hidden all-zero season never gets
  // fetched. Any failure defaults to an empty map; the section simply does
  // not render for the scopes that failed.
  const superlativesByScope: Record<string, SeasonSuperlative[]> = {};
  try {
    const allSeasons = await getAllSeasons();
    const seasonIdByYear = new Map(allSeasons.map((s) => [s.seasonYear, s.id]));

    const [seasonCardsList, allTimeCards] = await Promise.all([
      Promise.all(
        seasonYears.map(async (year) => {
          const seasonId = seasonIdByYear.get(year);
          if (seasonId == null) return [year, [] as SeasonSuperlative[]] as const;
          return [year, await getSeasonSuperlativeCards(seasonId)] as const;
        }),
      ),
      getAllTimeSuperlativeCards(),
    ]);

    for (const [year, cards] of seasonCardsList) {
      superlativesByScope[String(year)] = cards;
    }
    superlativesByScope["all-time"] = allTimeCards;
  } catch {
    // DB unavailable; the Superlatives section is omitted for every scope.
  }

  // Crest avatars for the projected playoff field (division projection is
  // owned by another query module, so resolve avatars here via the shared
  // helper rather than threading them through PlayoffProjection).
  let projectionAvatarUrls = new Map<string, string>();
  if (projection?.hasDivisions) {
    const projectionIds = [
      ...projection.field.map((t) => t.franchiseId),
      ...(projection.firstOut ? [projection.firstOut.franchiseId] : []),
    ];
    try {
      projectionAvatarUrls = await getLatestAvatarUrls(projectionIds);
    } catch {
      // Avatars unavailable; monogram crests render.
    }
  }

  const recordBook = buildRecordBook(allTimeData);

  const rail = (
    <>
      {recordBook.length > 0 && (
        <div>
          <h2 className="text-kicker mb-4">Record book</h2>
          <div className="grid grid-cols-2 gap-3">
            {recordBook.map((entry) => (
              <RecordBookCard key={entry.label} {...entry} />
            ))}
          </div>
        </div>
      )}

      {projection && projection.hasDivisions && projection.field.length > 0 && (
        <div>
          <h2 className="text-kicker mb-4">Projected playoff field</h2>
          <div className="space-y-1">
            {projection.field.map((team) => (
              <Link
                key={team.franchiseId}
                href={`/teams/${team.slug}`}
                className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 transition-[background-color,scale] duration-150 hover:bg-surface-muted active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <span className="font-mono text-sm tabular-nums text-text-tertiary w-4 shrink-0">
                  {team.seed}
                </span>
                <FranchiseLogo
                  slug={team.slug}
                  name={team.name}
                  abbreviation={team.abbreviation ?? undefined}
                  brandingColor={team.brandingColor ?? undefined}
                  avatarUrl={projectionAvatarUrls.get(team.franchiseId) ?? null}
                  size="sm"
                  decorative
                />
                <span className="text-body-sm font-medium text-text-primary truncate flex-1">
                  {team.name}
                </span>
                {team.isDivisionWinner ? (
                  <span className="text-caption text-accent-gold shrink-0">
                    {team.divisionName ?? "Div winner"}
                  </span>
                ) : (
                  <span className="text-caption text-text-tertiary shrink-0">
                    Wildcard
                  </span>
                )}
              </Link>
            ))}
            {projection.firstOut && (
              <TeamLink
                slug={projection.firstOut.slug}
                className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 border-t border-divider mt-2 pt-3 text-text-secondary"
              >
                <span className="text-caption text-text-tertiary w-4 shrink-0">
                  &middot;
                </span>
                <FranchiseLogo
                  slug={projection.firstOut.slug}
                  name={projection.firstOut.name}
                  abbreviation={projection.firstOut.abbreviation ?? undefined}
                  brandingColor={projection.firstOut.brandingColor ?? undefined}
                  avatarUrl={
                    projectionAvatarUrls.get(projection.firstOut.franchiseId) ?? null
                  }
                  size="sm"
                  decorative
                />
                <span className="text-body-sm font-medium truncate flex-1">
                  {projection.firstOut.name}
                </span>
                <span className="text-caption text-accent-warm shrink-0">
                  First out
                </span>
              </TeamLink>
            )}
          </div>
        </div>
      )}

      {powerView.entries.length > 0 && (
        <div>
          <SectionHeader
            title={
              powerView.mode === "preseason"
                ? "Preseason power"
                : "Power ranking"
            }
            viewAllHref="/records/power-rankings"
          />
          <div className="space-y-1">
            {/* Preseason: deltas are meaningless (no games yet), so show
                the power index instead of a trend arrow. */}
            {powerView.mode === "preseason"
              ? powerView.entries.slice(0, 4).map((entry) => (
                  <PowerMiniRow
                    key={entry.id}
                    rank={entry.rank}
                    slug={entry.slug}
                    name={entry.name}
                    abbreviation={entry.abbreviation}
                    brandingColor={entry.brandingColor}
                    avatarUrl={entry.avatarUrl}
                    trailing={
                      <span className="font-mono text-xs font-bold tabular-nums text-accent-gold shrink-0">
                        {(entry.powerScore * 100).toFixed(1)}
                      </span>
                    }
                  />
                ))
              : powerView.entries.slice(0, 4).map((entry) => (
                  <PowerMiniRow
                    key={entry.id}
                    rank={entry.rank}
                    slug={entry.slug}
                    name={entry.name}
                    abbreviation={entry.abbreviation}
                    brandingColor={entry.brandingColor}
                    avatarUrl={entry.avatarUrl}
                    trailing={
                      !entry.rankChange ? (
                        <span className="flex items-center gap-0.5 font-mono text-xs tabular-nums text-text-tertiary shrink-0">
                          <span aria-hidden>–</span>
                          <span>0</span>
                        </span>
                      ) : entry.rankChange > 0 ? (
                        <span className="flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums text-accent-green shrink-0">
                          <span aria-hidden>▲</span>
                          <span>{entry.rankChange}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 font-mono text-xs tabular-nums text-accent-warm shrink-0">
                          <span aria-hidden>▼</span>
                          <span>{Math.abs(entry.rankChange)}</span>
                        </span>
                      )
                    }
                  />
                ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-kicker mb-3">Go deeper</h2>
        <ul className="card-surface divide-y divide-divider px-2">
          {subPages.map((page) => {
            const Icon = page.icon;
            return (
              <li key={page.href}>
                <Link
                  href={page.href}
                  className="group flex min-h-14 items-center gap-3 rounded-lg px-2 py-3 transition-[background-color,scale] duration-150 hover:bg-surface-muted active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <Icon
                    className="size-5 shrink-0 text-accent-gold"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-text-primary">
                      {page.label}
                    </span>
                    <span className="block text-body-sm text-text-secondary">
                      {page.description}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5"
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );

  return (
    <>
      <PageSection
        as="h1"
        title="Records"
        intro="Standings, head-to-head and milestones."
      />

      <RecordsSeasonView
        allTimeData={allTimeData}
        seasonData={seasonDataRecord}
        seasonYears={seasonYears}
        projectionSeasonYear={
          projection?.hasDivisions ? projectionSeasonYear : null
        }
        projectionFieldIds={
          projection?.hasDivisions
            ? projection.field.map((t) => t.franchiseId)
            : undefined
        }
        superlativesByScope={superlativesByScope}
        rail={rail}
      />
    </>
  );
}
