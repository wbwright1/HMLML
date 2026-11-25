import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { TeamLink } from "@/components/team-link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { MatchupRow } from "@/components/matchup-row";
import { StatHero } from "@/components/stat-hero";
import { EmptyState } from "@/components/empty-state";
import { WeekBanner } from "@/components/week-banner";
import { WeeklySuperlativeCard } from "@/components/weekly-superlative-card";
import { StandingsSnapshotCard } from "@/components/standings-snapshot-card";
import { ScorePoller } from "@/app/matchups/score-poller";
import {
  getCurrentWeekMatchups,
  getLatestSeason,
  type PairedMatchup,
} from "@/lib/queries/matchups";
import { TeamFlag, type FlagTeam } from "@/components/hub/team-flag";
import { getSeasonStandings } from "@/lib/queries/seasons";
import {
  getHomepageSuperlatives,
  getHubLiveData,
  getLastWeekResults,
  type HubLiveData,
} from "@/lib/queries/homepage";
import { getWeeklySuperlatives } from "@/lib/queries/superlatives";
import { getWeeklyLineupAwards } from "@/lib/queries/lineup-efficiency";
import { SNARKY_LABELS } from "@/lib/content";
import { getPlayoffProjection } from "@/lib/queries/divisions";
import { getPlayoffPicture, type PlayoffPicture } from "@/lib/queries/playoff-picture";
import { PlayoffPictureCard } from "@/components/hub/playoff-picture-card";
import { getRivalryWeek, rivalryPairKey } from "@/lib/queries/rivalry-week";
import { getNamedRivalries } from "@/lib/queries/rivalries";
import { namedRivalryLookupFrom } from "@/lib/hub/gotw-context";
import { computeStandingsRaceTags } from "@/lib/queries/playoff-race";
import { StatChip, GameCard, toLadderEntries } from "@/components/hub/shared";
import { BetweenWeeksHub } from "@/components/hub/between-weeks-hub";
import { getBookBoard, resolveBookWeek, type BookGame } from "@/lib/queries/book";
import { BookRailCard } from "@/components/hub/book-rail-card";
import { getHubPowerPreview, type HubPowerPreview } from "@/lib/queries/power-preview";
import { PowerPulseCard } from "@/components/hub/power-pulse-card";
import { HubSection } from "@/components/hub/rail-card";
import { rethrowUnlessTolerable } from "@/lib/db-guard";

export async function RegularSeasonHub({
  matchupData,
  latestSeason,
  standings,
  isGameWindow,
  nflWeek,
  isBetweenWeeks = false,
  nextKickoff = null,
}: {
  matchupData: Awaited<ReturnType<typeof getCurrentWeekMatchups>>;
  latestSeason: Awaited<ReturnType<typeof getLatestSeason>>;
  standings: Awaited<ReturnType<typeof getSeasonStandings>>;
  isGameWindow: boolean;
  nflWeek: number;
  /** True on the Tue/Wed lull: regular season, no live games, and the current
   * week's matchups are all still scheduled (upcoming week not yet kicked off). */
  isBetweenWeeks?: boolean;
  /** Earliest pre_game kickoff for the current NFL week, or null if unknown. */
  nextKickoff?: Date | null;
}) {
  const week = matchupData?.week ?? nflWeek;
  const seasonYear = matchupData?.seasonYear ?? latestSeason?.seasonYear ?? new Date().getFullYear();

  // Between-weeks lull (state 1d): the slate is set but no game has kicked off.
  // Renders the newsletter-replacement layout; the game-window and post-week
  // branches below are left untouched.
  if (isBetweenWeeks) {
    return (
      <BetweenWeeksHub
        matchups={matchupData?.matchups ?? []}
        standings={standings}
        seasonId={matchupData?.seasonId ?? latestSeason?.id}
        seasonYear={seasonYear}
        week={week}
        nextKickoff={nextKickoff}
        playoffWeekStart={latestSeason?.playoffWeekStart ?? null}
      />
    );
  }

  // Fetch superlatives and last week results
  let superlatives: Awaited<ReturnType<typeof getHomepageSuperlatives>> | null = null;
  let weeklySuperlatives: Awaited<ReturnType<typeof getWeeklySuperlatives>> | null = null;
  let lastWeekResults: Awaited<ReturnType<typeof getLastWeekResults>> | null = null;
  let weeklyCoachingMalpractice: Awaited<ReturnType<typeof getWeeklyLineupAwards>> | null = null;
  // Per-roster live inputs (players left, projected remaining) for win-prob
  // bars and the Players Left hero stat. Empty when the backfill has not run.
  let hubLive: HubLiveData | undefined;
  // Playoff projection drives the ladder's seed badges and playoff-line cutoff;
  // undefined when unavailable (RISK-A/RISK-B degrade to the current default).
  let projection: Awaited<ReturnType<typeof getPlayoffProjection>> | undefined;
  let playoffPicture: PlayoffPicture | null = null;
  // Power Rankings preview for the post-week branch (#277). Renders below
  // "This Week's Damage", per CLAUDE.md's Regular Season hub table.
  let powerPreview: HubPowerPreview | null = null;

  if (latestSeason) {
    try {
      [superlatives, lastWeekResults, hubLive] = await Promise.all([
        getHomepageSuperlatives(latestSeason.id),
        week > 1 ? getLastWeekResults(latestSeason.id, week) : null,
        getHubLiveData(latestSeason.id, week),
      ]);

      // Get weekly superlatives for the latest completed week
      const completedWeek = week > 1 ? week - 1 : week;
      [weeklySuperlatives, weeklyCoachingMalpractice] = await Promise.all([
        getWeeklySuperlatives(latestSeason.id, completedWeek),
        getWeeklyLineupAwards(latestSeason.id, completedWeek),
      ]);
    } catch {
      // Data may not be available
    }

    try {
      projection = await getPlayoffProjection(latestSeason.id);
    } catch {
      // Projection may not be available; ladder falls back to plain standings.
    }

    // Midseason lead module (week 8 to the end of the regular season). A DB
    // error throws at request time so ISR never caches a hub without it.
    try {
      playoffPicture = await getPlayoffPicture(latestSeason.id, week, latestSeason.playoffWeekStart);
    } catch (e) {
      rethrowUnlessTolerable(e);
    }

    try {
      powerPreview = await getHubPowerPreview();
    } catch (e) {
      rethrowUnlessTolerable(e);
      powerPreview = null;
    }
  }

  const hasPlayersLeftStat = (hubLive?.totalStarters ?? 0) > 0;

  const completedWeek = week > 1 ? week - 1 : week;
  const gamesInProgress = matchupData?.matchups.filter((m) => m.status === "in_progress").length ?? 0;

  // Hero stat chips derived from the current week's scores (existing data only).
  const currentMatchups = matchupData?.matchups ?? [];
  // Carries crest fields alongside the name so the chip can show a logo rather
  // than a bare code (see CLAUDE.md, Franchise Identity Display).
  const toFlagTeam = (
    t: PairedMatchup["homeTeam"],
  ): FlagTeam & { points: number } => ({
    name: t.franchiseName,
    slug: t.franchiseSlug,
    abbreviation: t.franchiseAbbreviation,
    brandingColor: t.franchiseBrandingColor,
    avatarUrl: t.avatarUrl,
    points: t.points,
  });
  const teamScores = currentMatchups.flatMap((m) => [
    toFlagTeam(m.homeTeam),
    toFlagTeam(m.awayTeam),
  ]);
  const highScore = teamScores.length
    ? teamScores.reduce((best, t) => (t.points > best.points ? t : best))
    : null;
  const closestGame = currentMatchups.length
    ? currentMatchups.reduce<{
        margin: number;
        a: FlagTeam;
        b: FlagTeam;
      } | null>((best, m) => {
        const margin = Math.abs(m.homeTeam.points - m.awayTeam.points);
        if (best === null || margin < best.margin) {
          return {
            margin,
            a: toFlagTeam(m.homeTeam),
            b: toFlagTeam(m.awayTeam),
          };
        }
        return best;
      }, null)
    : null;

  // Rivalry Week: badge current-week pairings that are mutual top rivals.
  // Empty (renders nothing) in the offseason or with no lifetime history.
  let rivalrySet = new Set<string>();
  try {
    rivalrySet = await getRivalryWeek(currentMatchups);
  } catch {
    // Rivalry data may not be available; badges simply do not render.
  }

  // Commish-named rivalries: the badge shows the league's own name for the
  // pair. getNamedRivalries rethrows a production DB error itself
  // (rethrowUnlessTolerable), so a failure cannot ISR-cache a hub that
  // silently dropped the names.
  const namedRivalryOf = namedRivalryLookupFrom(await getNamedRivalries());

  // Provably-correct playoff-race tags. Renders nothing before week 8, outside
  // the regular season, or when the data is incomplete.
  const raceTags = computeStandingsRaceTags(standings, {
    week,
    playoffWeekStart: latestSeason?.playoffWeekStart,
  });

  const ladderEntries = toLadderEntries(standings, projection, raceTags);

  // Per-season crests keyed by franchise, sourced from the standings (which
  // carry avatarUrl); GameCard falls back to monograms for any missing entry.
  const avatarByFranchiseId = new Map<string, string>();
  for (const s of standings) {
    if (s.avatarUrl) avatarByFranchiseId.set(s.franchiseId, s.avatarUrl);
  }

  // The Book's priced lines for this week, keyed by matchup id. Genuinely
  // optional (book_lines can be empty pre-first-sync, or the whole feature
  // predates a given season), so an empty catch is correct here. The week
  // must agree with resolveBookWeek() (the same source /book, the pick
  // server actions, and the sync all use), or the hub can advertise a line
  // for a week The Book is not actually trading (#244).
  let bookGames: BookGame[] = [];
  if (latestSeason) {
    try {
      const bookWeek = await resolveBookWeek();
      if (bookWeek != null && bookWeek.week === week) {
        bookGames = await getBookBoard(bookWeek.seasonId, bookWeek.seasonYear, bookWeek.week);
      }
    } catch {
      // The Book is an aside on the hub; absence is fine.
    }
  }
  const bookGameByMatchup = new Map(bookGames.map((g) => [g.matchupId, g]));

  return (
    <>
      {/* Hero */}
      <section className="pt-2 pb-6 lg:flex lg:items-start lg:justify-between lg:gap-8">
        <div>
          {/* No kicker above the headline (UI/UX pass): the live pill names
              the week; the headline states it. */}
          <h1 className="text-display">Week {week}</h1>
        </div>

        {((highScore && highScore.points > 0) || hasPlayersLeftStat) && (
          <div className="mt-6 lg:mt-0 flex flex-wrap gap-3">
            {highScore && highScore.points > 0 && (
              <StatChip
                label="High score"
                value={highScore.points.toFixed(1)}
                context={<TeamFlag team={highScore} />}
              />
            )}
            {highScore && highScore.points > 0 && closestGame && (
              <StatChip
                label="Closest game"
                value={`+${closestGame.margin.toFixed(1)}`}
                context={
                  <>
                    <TeamFlag team={closestGame.a} compact />
                    <span aria-hidden="true">·</span>
                    <TeamFlag team={closestGame.b} compact />
                  </>
                }
              />
            )}
            {hasPlayersLeftStat && hubLive && (
              <StatChip
                label="Players left"
                value={`${hubLive.totalLeft}`}
                context={`of ${hubLive.totalStarters}`}
              />
            )}
          </div>
        )}
      </section>

      {/* Game Window: all live matchups + ladder rail */}
      {isGameWindow && matchupData && matchupData.matchups.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* On the field */}
          <HubSection
            kicker="On the field"
            action={
              <Link
                href="/matchups"
                className={`${buttonVariants({ variant: "quiet", size: "sm" })} -mr-3`}
              >
                Matchup detail
                <ChevronRight aria-hidden="true" strokeWidth={2} data-icon="inline-end" />
              </Link>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchupData.matchups.map((matchup) => (
                <GameCard
                  key={matchup.matchupId}
                  matchup={matchup}
                  week={week}
                  seasonYear={seasonYear}
                  hubLive={hubLive}
                  avatars={avatarByFranchiseId}
                  isRivalry={rivalrySet.has(
                    rivalryPairKey(
                      matchup.homeTeam.franchiseId,
                      matchup.awayTeam.franchiseId
                    )
                  )}
                  rivalryName={
                    namedRivalryOf?.(
                      matchup.homeTeam.franchiseId,
                      matchup.awayTeam.franchiseId
                    )?.name ?? null
                  }
                  bookGame={bookGameByMatchup.get(matchup.matchupId)}
                />
              ))}
            </div>
            <ScorePoller initialIsGameWindow={isGameWindow} />
          </HubSection>

          {/* The ladder + weekly damage rail */}
          <aside className="space-y-8">
            {/* During live games the scores stay first; the playoff picture
                leads the rail instead of the page. */}
            {playoffPicture && <PlayoffPictureCard picture={playoffPicture} />}
            {bookGames.length > 0 && <BookRailCard games={bookGames} week={week} />}

            {ladderEntries.length > 0 && (
              <HubSection
                kicker="The ladder"
                action={
                  <Link
                    href="/records"
                    className={`${buttonVariants({ variant: "quiet", size: "sm" })} -mr-3`}
                  >
                    Records
                    <ChevronRight aria-hidden="true" strokeWidth={2} data-icon="inline-end" />
                  </Link>
                }
              >
                <StandingsSnapshotCard
                  standings={ladderEntries}
                  week={week}
                  seasonYear={seasonYear}
                />
              </HubSection>
            )}

            {weeklySuperlatives &&
              (weeklySuperlatives.highestScorer || weeklySuperlatives.biggestBlowout) && (
                <HubSection kicker={`Week ${completedWeek} damage`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {weeklySuperlatives.highestScorer && (
                      <WeeklySuperlativeCard
                        type="highest-scorer"
                        label="High score"
                        stat={weeklySuperlatives.highestScorer.points.toFixed(1)}
                        context={weeklySuperlatives.highestScorer.franchiseName}
                        week={completedWeek}
                        seasonYear={seasonYear}
                      />
                    )}
                    {weeklySuperlatives.biggestBlowout && (
                      <WeeklySuperlativeCard
                        type="biggest-blowout"
                        label={SNARKY_LABELS.MERCY_RULE.displayText}
                        stat={weeklySuperlatives.biggestBlowout.margin.toFixed(1)}
                        context={weeklySuperlatives.biggestBlowout.winner}
                        week={completedWeek}
                        seasonYear={seasonYear}
                      />
                    )}
                  </div>
                </HubSection>
              )}
          </aside>
        </div>
      )}

      {/* Outside Game Window: Standings + Superlatives */}
      {!isGameWindow && (
        <>
          {/* Playoff picture: leads the hub from week 8 until the playoffs. */}
          {playoffPicture && <PlayoffPictureCard picture={playoffPicture} />}
          {/* Week banner (surface card) */}
          <WeekBanner
            week={week}
            seasonYear={seasonYear}
            state={
              (matchupData?.matchups.every((m) => m.status === "complete") ?? false)
                ? "complete"
                : "pre-kickoff"
            }
            gamesInProgress={gamesInProgress}
          />

          {/* Matchup Results (if complete) */}
          {matchupData && matchupData.matchups.length > 0 && (
            <ScrollReveal>
              <PageSection
                label={`${seasonYear} season`}
                title={`Week ${week} matchups`}
              >
                <div className="space-y-3">
                  {matchupData.matchups.map((matchup) => {
                    const variant =
                      matchup.status === "in_progress"
                        ? "live"
                        : matchup.status === "complete"
                          ? "final"
                          : "preview";
                    return (
                      <Link
                        key={matchup.matchupId}
                        href={`/matchups/${seasonYear}/${week}/${matchup.matchupId}`}
                        className="block rounded-[14px] transition-[scale] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                      >
                        <MatchupRow
                          matchup={{
                            homeTeam: matchup.homeTeam,
                            awayTeam: matchup.awayTeam,
                            homeScore: matchup.homeTeam.points,
                            awayScore: matchup.awayTeam.points,
                            status: matchup.status,
                            matchupId: matchup.matchupId,
                          }}
                          variant={variant}
                        />
                      </Link>
                    );
                  })}
                </div>
              </PageSection>
            </ScrollReveal>
          )}

          {/* Standings (The Ladder) */}
          {ladderEntries.length > 0 && (
            <ScrollReveal>
              <PageSection label="Current" title="The ladder">
                <div className="space-y-6">
                  {bookGames.length > 0 && (
                    <BookRailCard games={bookGames} week={week} />
                  )}
                  <StandingsSnapshotCard
                    standings={ladderEntries}
                    week={week}
                    seasonYear={seasonYear}
                  />
                </div>
              </PageSection>
            </ScrollReveal>
          )}

          {/* Weekly Superlatives */}
          {weeklySuperlatives &&
            (weeklySuperlatives.closestWin ||
              weeklySuperlatives.biggestBlowout ||
              weeklySuperlatives.highestScorer ||
              weeklySuperlatives.lowestScorer ||
              weeklyCoachingMalpractice) && (
              <ScrollReveal>
                <PageSection
                  label={`Week ${completedWeek}`}
                  title="This week's damage"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {weeklySuperlatives.closestWin && (
                      <WeeklySuperlativeCard
                        type="closest-win"
                        label={SNARKY_LABELS.CARDIAC_CREW.displayText}
                        stat={`${weeklySuperlatives.closestWin.margin.toFixed(1)} pts`}
                        context="Nail-biter of the week"
                        teams={weeklySuperlatives.closestWin}
                        week={completedWeek}
                        seasonYear={seasonYear}
                      />
                    )}
                    {weeklySuperlatives.biggestBlowout && (
                      <WeeklySuperlativeCard
                        type="biggest-blowout"
                        label={SNARKY_LABELS.MERCY_RULE.displayText}
                        stat={`${weeklySuperlatives.biggestBlowout.margin.toFixed(1)} pts`}
                        context="Mercy rule material"
                        teams={weeklySuperlatives.biggestBlowout}
                        week={completedWeek}
                        seasonYear={seasonYear}
                      />
                    )}
                    {weeklySuperlatives.highestScorer && (
                      <WeeklySuperlativeCard
                        type="highest-scorer"
                        label="Highest scorer"
                        stat={`${weeklySuperlatives.highestScorer.points.toFixed(1)} pts`}
                        context={weeklySuperlatives.highestScorer.franchiseName}
                        week={completedWeek}
                        seasonYear={seasonYear}
                      />
                    )}
                    {weeklySuperlatives.lowestScorer && (
                      <WeeklySuperlativeCard
                        type="lowest-scorer"
                        label="Lowest scorer"
                        stat={`${weeklySuperlatives.lowestScorer.points.toFixed(1)} pts`}
                        context={weeklySuperlatives.lowestScorer.franchiseName}
                        week={completedWeek}
                        seasonYear={seasonYear}
                      />
                    )}
                    {weeklyCoachingMalpractice && (
                      <WeeklySuperlativeCard
                        type="coaching-malpractice"
                        label={weeklyCoachingMalpractice.displayText}
                        stat={weeklyCoachingMalpractice.stat}
                        context={weeklyCoachingMalpractice.franchiseName}
                        week={completedWeek}
                        seasonYear={seasonYear}
                      />
                    )}
                  </div>
                </PageSection>
              </ScrollReveal>
            )}

          {/* Power Rankings preview */}
          {powerPreview && (
            <ScrollReveal>
              <PowerPulseCard preview={powerPreview} />
            </ScrollReveal>
          )}

          {/* Season Superlatives */}
          {superlatives && (
            <ScrollReveal>
              <PageSection label="Season stats" title="The season ledger">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {superlatives.highestScore && (
                    <StatHero
                      value={superlatives.highestScore.points?.toFixed(1) ?? "0"}
                      label={
                        <TeamLink slug={superlatives.highestScore.franchiseSlug}>
                          {superlatives.highestScore.franchiseName ?? "Unknown"}
                        </TeamLink>
                      }
                      badge="High score"
                      context={`Week ${superlatives.highestScore.week}`}
                      variant="md"
                    />
                  )}
                  {superlatives.longestStreak && superlatives.longestStreak.streak > 1 && (
                    <StatHero
                      value={`${superlatives.longestStreak.streak}W`}
                      label={
                        <TeamLink slug={superlatives.longestStreak.franchiseSlug}>
                          {superlatives.longestStreak.franchiseName}
                        </TeamLink>
                      }
                      badge={SNARKY_LABELS.ON_FIRE.displayText}
                      variant="md"
                    />
                  )}
                  {superlatives.closestMatchup && (
                    <StatHero
                      value={superlatives.closestMatchup.margin.toFixed(1)}
                      label={`${superlatives.closestMatchup.teamA} vs ${superlatives.closestMatchup.teamB}`}
                      badge="Closest matchup"
                      variant="md"
                    />
                  )}
                  {superlatives.mostAllTimeWins && (
                    <StatHero
                      value={superlatives.mostAllTimeWins.totalWins}
                      label={
                        <TeamLink slug={superlatives.mostAllTimeWins.franchiseSlug}>
                          {superlatives.mostAllTimeWins.franchiseName}
                        </TeamLink>
                      }
                      badge="Most all-time wins"
                      variant="md"
                    />
                  )}
                </div>
              </PageSection>
            </ScrollReveal>
          )}

          {/* Last Week Results */}
          {lastWeekResults && lastWeekResults.results.length > 0 && (
            <ScrollReveal>
              <PageSection label="Last week" title={`Week ${lastWeekResults.week} results`}>
                <div className="space-y-2">
                  {lastWeekResults.results.map((result) => (
                    <div
                      key={`${result.winner}-${result.loser}`}
                      className="flex items-center justify-between rounded-[14px] border border-border bg-surface px-4 text-body-sm"
                    >
                      <span>
                        <TeamLink
                          slug={result.winnerSlug}
                          className="inline-flex min-h-11 items-center font-semibold text-text-primary"
                        >
                          {result.winner}
                        </TeamLink>
                        <span className="text-text-tertiary"> def. </span>
                        <TeamLink
                          slug={result.loserSlug}
                          className="inline-flex min-h-11 items-center text-text-tertiary"
                        >
                          {result.loser}
                        </TeamLink>
                      </span>
                      <span className="text-stat text-body-sm text-text-tertiary whitespace-nowrap ml-4">
                        {result.winnerScore.toFixed(1)} - {result.loserScore.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </PageSection>
            </ScrollReveal>
          )}
        </>
      )}

      {/* Fallback */}
      {!matchupData && standings.length === 0 && (
        <EmptyState
          icon="chart"
          title="Syncing League Data"
          description="We're pulling data from Sleeper. Standings, matchups, and history will appear here once the first sync completes."
        />
      )}
    </>
  );
}
