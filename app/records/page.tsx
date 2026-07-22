import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { SectionHeader } from "@/components/section-header";
import { FranchiseLogo } from "@/components/franchise-logo";
import { ScrollReveal } from "@/components/scroll-reveal";
import { TeamAwardCard } from "@/components/team-award-card";
import { StingCard } from "@/components/sting-card";
import {
  getLeaderboard,
  getSeasonYears,
  getAllSeasonLeaderboards,
  getPowerRankings,
} from "@/lib/queries/records";
import { getLatestSeason } from "@/lib/queries/matchups";
import { getSeasonSuperlatives, type SeasonSuperlative } from "@/lib/queries/superlatives";
import { getSeasonLineupAwards, type LineupAward } from "@/lib/queries/lineup-efficiency";
import { getPlayoffProjection } from "@/lib/queries/divisions";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { LeaderboardTable } from "@/app/records/leaderboard-table";
import type { LeaderboardEntry, PowerRankingEntry } from "@/lib/queries/records";
import type { PlayoffProjection } from "@/lib/queries/divisions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Records & Rankings | Harambe Memorial League Memorial League",
  description:
    "All-time leaderboard, head-to-head records, rivalries, and trophy case for the Harambe Memorial League Memorial League.",
};

const subPages = [
  {
    href: "/records/head-to-head",
    label: "Head-to-Head",
    description: "Compare any two franchises all-time",
  },
  {
    href: "/records/rivalries",
    label: "Rivalries",
    description: "The closest and most played matchups",
  },
  {
    href: "/records/power-rankings",
    label: "Power Rankings",
    description: "Current season standings and context",
  },
  {
    href: "/records/trophies",
    label: "Trophy Case",
    description: "Every champion in league history",
  },
  {
    href: "/history",
    label: "History",
    description: "The full season-by-season timeline",
  },
  {
    href: "/seasons",
    label: "Seasons",
    description: "Browse standings and champions by year",
  },
];

interface RecordBookEntry {
  label: string;
  value: string;
  context: string;
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
      label: "Most Wins",
      value: String(mostWins.wins),
      context: mostWins.name,
    });
  }

  const mostTitles = [...data].sort(
    (a, b) => b.championships - a.championships
  )[0];
  if (mostTitles && mostTitles.championships > 0) {
    entries.push({
      label: "Most Titles",
      value: `${mostTitles.championships}x`,
      context: mostTitles.name,
    });
  }

  const mostPF = [...data].sort((a, b) => b.pointsScored - a.pointsScored)[0];
  if (mostPF && mostPF.pointsScored > 0) {
    entries.push({
      label: "Career PF Leader",
      value: mostPF.pointsScored.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      }),
      context: mostPF.name,
    });
  }

  const eligible = data.filter((d) => d.wins + d.losses + d.ties > 0);
  const bestWinPct = [...eligible].sort((a, b) => b.winPct - a.winPct)[0];
  if (bestWinPct) {
    entries.push({
      label: "Best Win%",
      value: `${(bestWinPct.winPct * 100).toFixed(1)}%`,
      context: bestWinPct.name,
    });
  }

  return entries.slice(0, 4);
}

function RecordBookCard({ label, value, context }: RecordBookEntry) {
  return (
    <div className="rounded-[14px] border border-border bg-surface p-4">
      <p className="text-caption text-accent-gold mb-2">{label}</p>
      <p className="text-[28px] leading-none font-mono font-bold tabular-nums text-text-primary">
        {value}
      </p>
      <p className="text-body-sm text-text-tertiary mt-2 truncate">{context}</p>
    </div>
  );
}

export default async function RecordsPage() {
  let allTimeData: LeaderboardEntry[] = [];
  let seasonYears: number[] = [];
  let powerRankings: PowerRankingEntry[] = [];
  const seasonDataRecord: Record<string, LeaderboardEntry[]> = {};
  let seasonSuperlatives: SeasonSuperlative[] = [];
  let coachingMalpractice: LineupAward | null = null;
  let whatCouldveBeen: LineupAward | null = null;
  let projection: PlayoffProjection | null = null;
  let projectionSeasonYear: number | null = null;

  try {
    [allTimeData, seasonYears, powerRankings] = await Promise.all([
      getLeaderboard(),
      getSeasonYears(),
      getPowerRankings(),
    ]);

    // Batch-fetch all season leaderboards in a single query
    const allSeasonData = await getAllSeasonLeaderboards();
    for (const [year, data] of Object.entries(allSeasonData)) {
      seasonDataRecord[year] = data;
    }

    // The Superlatives: season awards + optimal-lineup awards for the latest
    // season. Lineup awards return null for legacy (pre-Sleeper) seasons that
    // never got player_week_points, which the render below hides gracefully.
    // Also the playoff projection for the current season only; hasDivisions
    // gates whether that block renders at all (RISK-B: nothing worth showing
    // for a legacy/no-division season, or when there's no current season).
    const latestSeason = await getLatestSeason();
    if (latestSeason) {
      const [superlatives, lineupAwards, playoffProjection] = await Promise.all([
        getSeasonSuperlatives(latestSeason.id),
        getSeasonLineupAwards(latestSeason.id),
        getPlayoffProjection(latestSeason.id),
      ]);
      seasonSuperlatives = superlatives;
      coachingMalpractice = lineupAwards?.coachingMalpractice ?? null;
      whatCouldveBeen = lineupAwards?.whatCouldveBeen ?? null;
      projection = playoffProjection;
      projectionSeasonYear = latestSeason.seasonYear;
    }
  } catch {
    // DB may not be connected
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
  const hasSuperlatives =
    seasonSuperlatives.length > 0 || coachingMalpractice || whatCouldveBeen;

  return (
    <>
      <PageSection label="Standings · Record Book" title="The Records.">
        <p className="text-body-lg text-text-secondary max-w-prose">
          The definitive record book for the Harambe Memorial League Memorial League: career
          stats, head-to-head records, and every milestone worth remembering.
        </p>
      </PageSection>

      <section className="pb-12 md:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 lg:gap-10 items-start">
          {/* Main: full standings */}
          <div>
            <LeaderboardTable
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
            />
          </div>

          {/* Right rail */}
          <div className="space-y-8">
            {recordBook.length > 0 && (
              <div>
                <p className="text-kicker mb-4">The Record Book</p>
                <div className="grid grid-cols-2 gap-3">
                  {recordBook.map((entry) => (
                    <RecordBookCard key={entry.label} {...entry} />
                  ))}
                </div>
              </div>
            )}

            {projection && projection.hasDivisions && projection.field.length > 0 && (
              <div>
                <p className="text-kicker mb-4">Projected Playoff Field</p>
                <div className="space-y-1">
                  {projection.field.map((team) => (
                    <Link
                      key={team.franchiseId}
                      href={`/teams/${team.slug}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted"
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
                    <div className="flex items-center gap-3 rounded-lg px-2 py-2 border-t border-divider mt-2 pt-3">
                      <span className="text-caption text-text-tertiary w-4 shrink-0">
                        &mdash;
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
                      <span className="text-body-sm font-medium text-text-secondary truncate flex-1">
                        {projection.firstOut.name}
                      </span>
                      <span className="text-caption text-accent-warm shrink-0">
                        First Out
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {powerRankings.length > 0 && (
              <div>
                <SectionHeader
                  title="Power Ranking"
                  viewAllHref="/records/power-rankings"
                />
                <div className="space-y-1">
                  {powerRankings.slice(0, 4).map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/teams/${entry.slug}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted"
                    >
                      <span className="font-mono text-sm tabular-nums text-text-tertiary w-4 shrink-0">
                        {entry.rank}
                      </span>
                      <FranchiseLogo
                        slug={entry.slug}
                        name={entry.name}
                        abbreviation={entry.abbreviation}
                        brandingColor={entry.brandingColor}
                        avatarUrl={entry.avatarUrl}
                        size="sm"
                        decorative
                      />
                      <span className="text-body-sm font-medium text-text-primary truncate flex-1">
                        {entry.name}
                      </span>
                      {entry.formDelta === 0 ? (
                        <span className="flex items-center gap-0.5 font-mono text-xs tabular-nums text-text-tertiary shrink-0">
                          <span aria-hidden>–</span>
                          <span>0</span>
                        </span>
                      ) : entry.formDelta > 0 ? (
                        <span className="flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums text-accent-green shrink-0">
                          <span aria-hidden>▲</span>
                          <span>{entry.formDelta}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 font-mono text-xs tabular-nums text-accent-warm shrink-0">
                          <span aria-hidden>▼</span>
                          <span>{Math.abs(entry.formDelta)}</span>
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-kicker mb-4">Explore</p>
              <div className="grid grid-cols-2 gap-3">
                {subPages.map((page, index) => (
                  <ScrollReveal key={page.href} delay={index * 60}>
                    <Link
                      href={page.href}
                      className="block rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-muted"
                    >
                      <p className="text-body-sm font-semibold text-accent-gold">
                        {page.label}
                      </p>
                      <p className="text-caption text-text-tertiary mt-1 hidden sm:block normal-case tracking-normal font-normal">
                        {page.description}
                      </p>
                    </Link>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {hasSuperlatives && (
        <ScrollReveal>
          <PageSection label="Season Awards" title="The Superlatives">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {seasonSuperlatives.map((s) =>
                s.tone === "sting" ? (
                  <StingCard
                    key={s.labelKey}
                    label={s.displayText}
                    franchiseName={s.franchiseName}
                    franchiseSlug={s.franchiseSlug}
                    context={s.context}
                    stat={s.stat}
                  />
                ) : (
                  <TeamAwardCard
                    key={s.labelKey}
                    label={s.displayText}
                    stat={s.stat}
                    context={s.context}
                    franchiseName={s.franchiseName}
                    franchiseSlug={s.franchiseSlug}
                    tone={s.tone}
                  />
                )
              )}
              {coachingMalpractice && (
                <StingCard
                  label={coachingMalpractice.displayText}
                  franchiseName={coachingMalpractice.franchiseName}
                  franchiseSlug={coachingMalpractice.franchiseSlug}
                  context={coachingMalpractice.context}
                  stat={coachingMalpractice.stat}
                />
              )}
              {whatCouldveBeen && (
                <TeamAwardCard
                  label={whatCouldveBeen.displayText}
                  stat={whatCouldveBeen.stat}
                  context={whatCouldveBeen.context}
                  franchiseName={whatCouldveBeen.franchiseName}
                  franchiseSlug={whatCouldveBeen.franchiseSlug}
                  tone={whatCouldveBeen.tone}
                />
              )}
            </div>
          </PageSection>
        </ScrollReveal>
      )}
    </>
  );
}
