import Link from "next/link";
import { ChevronRight, Clock } from "lucide-react";
import { TeamLink } from "@/components/team-link";
import { PlayerLink } from "@/components/player-link";
import { EditorialBody } from "@/components/editorial-emphasis";
import { KickoffCountdown } from "@/components/kickoff-countdown";
import {
  SmackFeed,
  smackItemsFromPosts,
  smackItemsFromSeeds,
} from "@/components/smack-feed";
import { SmackComposerSlot } from "@/components/smack-composer-slot";
import { getRecentSmackPosts, anySmackPostsExist } from "@/lib/queries/smack";
import { PlayerHeadshot } from "@/components/player-headshot";
import { GameOfTheWeekCard } from "@/components/hub/game-of-the-week-card";
import { SlateCard } from "@/components/hub/slate-card";
import { teamAcronym } from "@/lib/team-acronym";
import { formatSpread } from "@/lib/book/pricing";
import { HeroClaimCta } from "@/components/hub/hero-claim-cta";
import { MonoNums } from "@/components/hub/mono-nums";
import { buttonVariants } from "@/components/ui/button-variants";
import type { PairedMatchup } from "@/lib/queries/matchups";
import type { getSeasonStandings } from "@/lib/queries/seasons";
import {
  getHeadToHead,
  getHeadToHeadHistory,
  type HeadToHeadRecord,
} from "@/lib/queries/records";
import {
  buildSlateAngles,
  summarizeMeetingHistory,
  type MeetingHistorySummary,
  type SlateAngleInput,
} from "@/lib/hub/slate-angle";
import { getWeeklySuperlatives } from "@/lib/queries/superlatives";
import { getWeekBenchLeader } from "@/lib/queries/lineup-efficiency";
import { getWeekRecap, type WeekRecap } from "@/lib/queries/week-recap";
import { isRecapWindowOpen } from "@/lib/hub/week-recap";
import { isRecapWindowForced } from "@/lib/queries/nfl-state";
import { WeekRecapSection, BenchCallout } from "@/components/hub/week-recap-section";
import {
  getWeekStarterPool,
  getPlayersToWatchFromPool,
  topProjectedStarterByMatchup,
  type PlayerToWatch,
} from "@/lib/queries/players-to-watch";
import { getRecentLeagueMoves, type LeagueMove } from "@/lib/queries/league-moves";
import { getWeekInHistory, type WeekReceipt } from "@/lib/queries/week-history";
import { FranchiseLogo } from "@/components/franchise-logo";
import {
  getHubEditorial,
  HERO_DEK_FALLBACK,
  HUB_CLAIM_CTA,
  HUB_LABELS,
  sentenceCaseLabel,
  matchupPairKey,
} from "@/lib/content";
import { sharesPhraseWithAny } from "@/lib/content-gen/phrases";
import { getHubPowerPreview, type HubPowerPreview } from "@/lib/queries/power-preview";
import { PowerPulseCard } from "@/components/hub/power-pulse-card";
import {
  HubSection,
  RailCard,
  RailRows,
  HUB_ROW_LINK,
} from "@/components/hub/rail-card";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { getBookBoard, resolveBookWeek, type BookGame } from "@/lib/queries/book";
import { bookLineText } from "@/lib/book/shared";
import { formatH2HLine, gameOfWeekBlurb } from "@/lib/hub/between-weeks";
import {
  heroDekFromData,
  heroFactLine,
  heroHeadline,
  heroKickerTail,
  repeatsHeroNumber,
  type HeroHeadlineInput,
  type HeroSlateTeam,
} from "@/lib/hub/hero-headline";
import {
  namedRivalryLookupFrom,
  resolveGameOfTheWeek,
  type GotwResolution,
} from "@/lib/hub/gotw-context";
import { getNamedRivalries } from "@/lib/queries/rivalries";

type Standing = Awaited<ReturnType<typeof getSeasonStandings>>[number];

interface BetweenWeeksHubProps {
  matchups: PairedMatchup[];
  standings: Standing[];
  seasonId: number | null | undefined;
  seasonYear: number;
  week: number;
  nextKickoff: Date | null;
}

/**
 * State 1d: the Tue/Wed between-weeks hub. Curated to about seven modules
 * (UI/UX pass, 2026-11-24): the hero headline; while the recap window is open
 * the Week N wrap, Final scores and Team of the week; then Game of the week,
 * Rest of the slate, Power rankings, and a "More this week" list that folds
 * Players to watch, League moves and This week in history behind disclosure
 * rows instead of rendering them inline. The member smack feed closes the
 * page. On desktop the rail carries Players to watch beside the headliner.
 * Async RSC; does its own data fetching so page.tsx stays lean.
 */
export async function BetweenWeeksHub({
  matchups,
  standings,
  seasonId,
  seasonYear,
  week,
  nextKickoff,
}: BetweenWeeksHubProps) {
  const priorWeek = week > 1 ? week - 1 : week;
  // A ":recap" NFL_STATE_OVERRIDE (preview/dev only, never production) holds
  // the recap window open so the pinned e2e server reaches the recap state on
  // any weekday.
  const recapForced = isRecapWindowForced();

  // League-wide games-played gate. At week 1 every franchise is 0-0-0, so a
  // "1st in Division" claim would be fabricated. It picks the seeded opener
  // blurb below; the Game of the Week resolver derives the same flag itself
  // from the same standings.
  const anyGamesPlayed = standings.some(
    (s) => (s.wins ?? 0) + (s.losses ?? 0) + (s.ties ?? 0) > 0
  );

  // Between-weeks editorial is week-scoped (matchup angles, GOTW blurb, smack
  // feed for this week); DB content overlays the seeds when present.
  // anyGamesPlayed picks the opener-appropriate seeded GOTW blurb so it never
  // claims "first place on the line" before a single game has been played.
  const editorial = await getHubEditorial({
    seasonId: seasonId ?? undefined,
    week,
    anyGamesPlayed,
  });

  // Member smack feed: real posts win when present. Site Desk seeds only stand
  // in when the board is genuinely empty (no posts at all); when posts exist
  // but are all hidden, moderation must NOT resurrect the seeds. Member and
  // smack are settled independently so one failing (e.g. the members/smack
  // tables not existing yet on a pre-0008 DB) never blanks the other.
  const [smackResult] = await Promise.allSettled([
    Promise.all([getRecentSmackPosts(4), anySmackPostsExist()]),
  ]);
  const [realSmack, anySmack] =
    smackResult.status === "fulfilled" ? smackResult.value : [[], false];

  const smackFromDesk = realSmack.length === 0 && !anySmack;
  const smackItems = smackFromDesk
    ? smackItemsFromSeeds(editorial.smackPosts)
    : smackItemsFromPosts(realSmack);

  // Standings lookup for records, points-for, and division identity.
  const standingBy = new Map(standings.map((s) => [s.franchiseId, s]));
  const record = (id: string): string => {
    const s = standingBy.get(id);
    return s ? `${s.wins ?? 0}-${s.losses ?? 0}` : "0-0";
  };

  // Rail data (degrades to empty when the DB or week has nothing).
  let weeklySuperlatives: Awaited<ReturnType<typeof getWeeklySuperlatives>> | null =
    null;
  let benchLeader: Awaited<ReturnType<typeof getWeekBenchLeader>> = null;
  // The post-week recap (the newsletter): null at week 1 (no completed prior
  // week) or while the prior week is still being played.
  let weekRecap: WeekRecap | null = null;
  let pool: Awaited<ReturnType<typeof getWeekStarterPool>> = [];
  let leagueMoves: LeagueMove[] = [];
  let weekReceipts: WeekReceipt[] = [];
  let bookGames: BookGame[] = [];
  // Whether the batch below actually landed, so the Game of the Week resolver
  // reuses what it fetched instead of querying it again, and fetches it
  // itself when the batch did not land.
  let batchLanded = false;
  let powerPreview: HubPowerPreview | null = null;
  // The full record (streak included), not just the counts: the derived slate
  // angle reads the streak, and it is oriented from the HOME team's
  // perspective because getHeadToHead is called as (home, away) below.
  const h2hByMatchup = new Map<number, HeadToHeadRecord>();
  // Completed-meeting history per matchup, reduced to what the angle ladder
  // needs. Genuinely optional enrichment: an empty entry degrades the ladder
  // to the counts-only rungs rather than blanking the card.
  const h2hHistoryByMatchup = new Map<number, MeetingHistorySummary>();

  if (seasonId != null) {
    // Fired concurrently with the batch below (not awaited inside it) so it
    // adds no serial round trip, but settled in its own try/catch so a DB
    // error here goes through rethrowUnlessTolerable rather than being
    // swallowed by the batch's bare catch below (#277).
    const powerPreviewPromise = getHubPowerPreview();

    try {
      // The Book's week must agree with resolveBookWeek() (the same source
      // /book, the pick server actions, and the sync all use), or the hub can
      // advertise a line for a week The Book is not actually trading (#244).
      const bookWeek = await resolveBookWeek();
      const bookMatchesSlate = bookWeek != null && bookWeek.week === week;

      // Week 1 has no completed prior week: asking "In The Books" or "Left On
      // The Bench" about week 0 would either return null by luck or (if a
      // future data change ever lets it) resurrect a false claim. Skip the
      // fetches outright rather than relying on the empty-shape fallback.
      const [
        superlatives,
        bench,
        weekPool,
        moves,
        receipts,
        board,
        h2hResults,
        historyResults,
      ] = await Promise.all([
        week === 1
          ? Promise.resolve(null)
          : getWeeklySuperlatives(seasonId, priorWeek),
        week === 1
          ? Promise.resolve(null)
          : getWeekBenchLeader(seasonId, priorWeek),
        getWeekStarterPool(seasonId, week),
        // Both rail cards below read Postgres only: League Moves replaced the
        // Sleeper-backed Trending module, and the history card is our own
        // completed matchups. Neither is week-1 gated; both have real data on
        // opening week (preseason churn, and 2021 onward).
        getRecentLeagueMoves(seasonId, 4),
        getWeekInHistory(seasonYear, week),
        bookMatchesSlate
          ? getBookBoard(bookWeek.seasonId, bookWeek.seasonYear, bookWeek.week)
          : Promise.resolve([]),
        // Both per-matchup batches stay inside this one Promise.all (nested so
        // the outer tuple keeps its types): the all-time counts drive the
        // card's top-right record, the meeting history drives the last-meeting
        // and playoff rungs of the derived angle. Both are cachedQuery-backed
        // and this page is ISR-cached, so the extra round trip is paid once
        // per sync, not per request.
        Promise.all(
          matchups.map((m) =>
            getHeadToHead(m.homeTeam.franchiseId, m.awayTeam.franchiseId)
          )
        ),
        Promise.all(
          matchups.map((m) =>
            getHeadToHeadHistory(m.homeTeam.franchiseId, m.awayTeam.franchiseId)
          )
        ),
      ]);

      weeklySuperlatives = superlatives;
      benchLeader = bench;
      pool = weekPool;
      leagueMoves = moves;
      weekReceipts = receipts;
      bookGames = board;

      matchups.forEach((m, i) => {
        h2hByMatchup.set(m.matchupId, h2hResults[i]);

        // Side A is the HOME team, matching the (home, away) orientation the
        // getHeadToHead call above uses.
        h2hHistoryByMatchup.set(
          m.matchupId,
          summarizeMeetingHistory(historyResults[i] ?? [], m.homeTeam.franchiseId)
        );
      });
      batchLanded = true;
    } catch {
      // DB may be unavailable; the hero + countdown still render.
    }

    try {
      powerPreview = await powerPreviewPromise;
    } catch (e) {
      rethrowUnlessTolerable(e);
      powerPreview = null;
    }

    // Settled outside the batch above on purpose: its bare catch would let a
    // transient DB error ISR-cache a hub with no recap until the next sync,
    // which is the exact hollow render lib/db-guard.ts exists to prevent.
    // Window: Tuesday week roll through the Thursday MORNING cron (06:00
    // UTC daily sync), not through kickoff. That sync revalidates the hub,
    // so the cached page flips to the plain slate view at the same moment
    // the gate does (lib/hub/week-recap.ts).
    if (week > 1 && (recapForced || isRecapWindowOpen(new Date(), nextKickoff))) {
      try {
        weekRecap = await getWeekRecap(seasonId, priorWeek);
      } catch (e) {
        rethrowUnlessTolerable(e);
        weekRecap = null;
      }
    }
  }

  // Game of the Week: one shared resolver (lib/hub/gotw-context.ts) picks,
  // explains and describes it, and the content generator calls the SAME one,
  // so the stored blurb and this card can never be about different games.
  // Pieces the batch above already fetched are handed in, not re-queried.
  // Commish-named rivalries, fetched once for both the Game of the Week
  // resolver and the slate ladder so the two can never disagree about a
  // pair. Outside the batch's bare catch on purpose: getNamedRivalries
  // rethrows a production DB error (rethrowUnlessTolerable) rather than
  // letting ISR cache a hub that silently forgot the league's rivalries.
  const namedRivalryOf =
    seasonId != null && matchups.length > 0
      ? namedRivalryLookupFrom(await getNamedRivalries())
      : null;

  let gotw: GotwResolution | null = null;
  if (seasonId != null && matchups.length > 0) {
    try {
      gotw = await resolveGameOfTheWeek({
        seasonId,
        seasonYear,
        week,
        matchups,
        standings,
        namedRivalryOf,
        prefetched: {
          ...(batchLanded
            ? {
                h2hByMatchup,
                historyByMatchup: h2hHistoryByMatchup,
                pool,
                bookGames,
              }
            : {}),
          // The recap already loaded last week's finals; the blurb's form
          // facts reuse them rather than querying the week again.
          ...(weekRecap ? { priorFinals: weekRecap.results } : {}),
        },
      });
    } catch (e) {
      rethrowUnlessTolerable(e);
      gotw = null;
    }
  }

  const gotwId = gotw?.pick?.matchupId ?? null;
  const gameOfWeek = matchups.find((m) => m.matchupId === gotwId) ?? null;
  const restOfSlate = matchups.filter((m) => m.matchupId !== gotwId);
  const bowlName = gotw?.bowlName ?? null;
  const titleRematchIds = new Set(
    (gotw?.candidates ?? []).filter((c) => c.isTitleRematch).map((c) => c.matchupId)
  );
  const bookGameByMatchup = new Map(bookGames.map((g) => [g.matchupId, g]));

  // Highest projected starter per matchup, from the SAME pool Players to Watch
  // scores over, so the angle ladder's projected-star rung costs no new query.
  const topStarterByMatchup = topProjectedStarterByMatchup(pool);

  // An LLM-authored angle from hub_content outranks the builder, so those
  // cards are settled first and left OUT of the batch below. Otherwise an
  // overridden card would silently consume a hook (the streak, say) that a
  // builder-driven card could have used, and the visible slate would be less
  // varied than it needed to be.
  //
  // Except for a commish-named rivalry: its card always takes the builder's
  // rivalry rung (name, tagline, series). A named rivalry that is not the
  // Game of the Week lives on this grid, and a generated angle that never
  // mentions the name would make the league's own rivalry vanish from the hub.
  const angleOverrideOf = (m: PairedMatchup): string | null =>
    namedRivalryOf?.(m.homeTeam.franchiseId, m.awayTeam.franchiseId)
      ? null
      : (editorial.matchupAngles.byPair[
          matchupPairKey(m.homeTeam.franchiseSlug, m.awayTeam.franchiseSlug)
        ] ?? null);
  const needsBuiltAngle = restOfSlate.filter((m) => angleOverrideOf(m) == null);

  // Built as one batch: that is what makes the cards provably distinct
  // (buildSlateAngles moves a later card off a hook an earlier one took).
  const slateAngleInputs: SlateAngleInput[] = needsBuiltAngle.map((m) => {
    const history = h2hHistoryByMatchup.get(m.matchupId);
    const star = topStarterByMatchup.get(m.matchupId);
    return {
      teamA: { name: m.homeTeam.franchiseName },
      teamB: { name: m.awayTeam.franchiseName },
      h2h: h2hByMatchup.get(m.matchupId) ?? null,
      lastMeeting: history?.lastMeeting ?? null,
      playoffMeetingYears: history?.playoffMeetingYears ?? [],
      topProjected: star
        ? {
            playerName: star.playerName,
            position: star.position,
            side: star.franchiseId === m.homeTeam.franchiseId ? "A" : "B",
            projectedPoints: star.projectedPoints,
          }
        : null,
      isTitleRematch: titleRematchIds.has(m.matchupId),
      bowlName,
      recordA: record(m.homeTeam.franchiseId),
      recordB: record(m.awayTeam.franchiseId),
      anyGamesPlayed,
      namedRivalry: namedRivalryOf?.(m.homeTeam.franchiseId, m.awayTeam.franchiseId) ?? null,
    };
  });
  const builtAngles = buildSlateAngles(slateAngleInputs);
  const angleByMatchup = new Map(
    needsBuiltAngle.map((m, i) => [m.matchupId, builtAngles[i]])
  );

  // Players to Watch: the pre-kickoff replacement for the retrospective
  // "Standouts" rail. Uses the same pool fetched above; empty (never
  // "Standouts") when the pool is empty or nothing carries a projection.
  let playersToWatch: PlayerToWatch[] = [];
  if (seasonId != null && pool.length > 0) {
    try {
      playersToWatch = await getPlayersToWatchFromPool(pool, seasonId, week, {
        featuredMatchupId: gotwId,
      });
    } catch {
      // The rail is optional content; absence is fine.
    }
  }

  // The hero headline is a data-derived take (lib/hub/hero-headline.ts): last
  // week's finals while the recap renders under it, this week's slate
  // otherwise. The schedule fact lives on the Game of the week label row.
  const heroSlateTeam = (id: string, name: string): HeroSlateTeam => {
    const s = standingBy.get(id);
    return {
      franchiseId: id,
      name,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      ties: s?.ties ?? 0,
    };
  };
  const candidateById = new Map((gotw?.candidates ?? []).map((c) => [c.matchupId, c]));
  const heroInput: HeroHeadlineInput = {
    recapShown: weekRecap != null,
    // The recap's finals when it renders; otherwise the ones the resolver
    // loaded for the Game of the Week's form facts (slate rungs lead then,
    // so these only feed the dek fallback).
    priorFinals: weekRecap?.results ?? gotw?.priorFinals ?? [],
    slate: matchups.map((m) => {
      const home = standingBy.get(m.homeTeam.franchiseId);
      const away = standingBy.get(m.awayTeam.franchiseId);
      const sameDivision = home?.division != null && home.division === away?.division;
      return {
        a: heroSlateTeam(m.homeTeam.franchiseId, m.homeTeam.franchiseName),
        b: heroSlateTeam(m.awayTeam.franchiseId, m.awayTeam.franchiseName),
        divisionName: sameDivision ? (home?.divisionName ?? null) : null,
        canFlipDivisionLead: candidateById.get(m.matchupId)?.canFlipDivisionLead === true,
        namedRivalry:
          namedRivalryOf?.(m.homeTeam.franchiseId, m.awayTeam.franchiseId) ?? null,
        isGameOfWeek: m.matchupId === gotwId,
      };
    }),
    standings: standings.map((s) => heroSlateTeam(s.franchiseId, s.franchiseName)),
  };
  const headline = heroHeadline(heroInput);
  const slateMeta = `Week ${week} · ${heroKickerTail(nextKickoff)}`;

  // The featured card's blurb. A stored (generated) blurb is used ONLY when
  // its ref_key names the pair this card features: hub_content rows outlive
  // the run that wrote them, and a blurb about a different game (or a legacy
  // row with no ref_key) would put one matchup's words under another's names.
  // Otherwise the resolver's reason-derived blurb renders, which is the same
  // text the generator's template writes, so the fallback is never generic.
  //
  // The hero headline owns its fact (lib/hub/hero-claim.ts). A stored blurb
  // that prints the hero's number is dropped, and the derived blurb is
  // rebuilt with the claim so its form opener states each team's other true
  // fact instead ("just hung 204.9 on Taking Boutte", not "by 64.2" again).
  const gotwPairKey = gotw?.pairKey ?? null;
  const storedGotwBlurb =
    gotwPairKey && editorial.matchupAngles.gameOfWeekRefKey === gotwPairKey
      ? editorial.matchupAngles.gameOfWeekBlurb
      : null;
  const gotwBlurb =
    storedGotwBlurb && !repeatsHeroNumber(storedGotwBlurb, headline.claim)
      ? storedGotwBlurb
      : gotw?.blurbInput
        ? gameOfWeekBlurb({ ...gotw.blurbInput, heroClaim: headline.claim })
        : (gotw?.blurb ?? editorial.matchupAngles.gameOfWeekBlurb);

  // The line under the headline is ONE plain fact about the headline's
  // subject (heroFactLine), never a second punchline: the headline owns the
  // snark. Only when the rung has no clean companion fact does the older dek
  // chain run, with its copy-echo guard (issue #274): a stored dek that shares
  // a signature phrase with the Game of the Week card or the headline falls
  // back to a data sentence from another rung, then the seeded constant.
  const heroFact = heroFactLine(heroInput, headline, priorWeek);
  const linesBelowHero = [gotwBlurb, gotw?.kicker ?? "", headline.text].filter(Boolean);
  const heroDek =
    editorial.heroDek && !sharesPhraseWithAny(editorial.heroDek, linesBelowHero)
      ? editorial.heroDek
      : (heroDekFromData(heroInput, headline) ?? HERO_DEK_FALLBACK);

  const boxScoresHref = week > 1 ? `/seasons/${seasonYear}/week/${priorWeek}` : null;

  // The rail beside the headliner. While the recap renders it carries only
  // Players to watch; otherwise last week's superlatives and bench blunder
  // fall back here. When it would be empty the main column takes the full
  // width rather than leaving a gap beside the hero.
  const railFallbacks = !weekRecap;
  const railHasContent =
    playersToWatch.length > 0 ||
    (railFallbacks && (weeklySuperlatives != null || benchLeader != null));

  const slateMetaNode = (
    <p
      className="flex items-center gap-1.5 text-caption text-text-tertiary"
      data-testid="slate-meta"
    >
      <Clock aria-hidden="true" strokeWidth={2} className="size-4" />
      <span><MonoNums text={slateMeta} /></span>
    </p>
  );
  const showGotw = gameOfWeek != null && gotw?.kicker != null;

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)] gap-8 ${
        railHasContent ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""
      }`.trim()}
    >
      {/* Main column: the hero, then last week's receipts, then the week ahead */}
      <div className="space-y-8">
        {/* data-kickoff-target: the slate's first kickoff, read by
            e2e/hub-post-week.spec.ts to decide which recap-window state to
            assert. On the server section, not the client island, so it is
            present whether or not the countdown renders. */}
        <section
          className="pt-2"
          data-kickoff-target={nextKickoff?.toISOString()}
          data-recap-forced={recapForced ? "true" : undefined}
        >
          <div className="max-w-2xl">
            {/* No kicker above the headline: the live pill names the week.
                One serif run, numerals included: an upright mono figure
                dropped into a serif display sentence breaks the line
                (Blake, 2026-09-22). */}
            <h1
              className="text-display"
              data-testid="hero-headline"
              data-hero-rung={headline.rung}
            >
              {headline.text}
            </h1>
            <p className="mt-3 text-body-lg text-text-secondary" data-testid="hero-dek">
              {heroFact ? <MonoNums text={heroFact} /> : <EditorialBody body={heroDek} />}
            </p>
          </div>

          {/* Phone action row: the signed-out visitor's one primary action
              (a session island that renders nothing for members) plus a
              quiet way to the box scores. Desktop's topbar already carries
              the claim pill, and its Box scores link sits on the wrap. */}
          <div className="mt-6 flex flex-wrap items-center gap-2 lg:hidden">
            <HeroClaimCta label={HUB_CLAIM_CTA} />
            {boxScoresHref && (
              <Link
                href={boxScoresHref}
                className={buttonVariants({ variant: "quiet", size: "lg" })}
              >
                {HUB_LABELS.boxScores}
              </Link>
            )}
          </div>

          {/* The countdown only runs on the slate-only hub. While the recap
              leads (Tuesday roll to the Thursday morning cron) a ticking
              clock above last week's receipts pulled the eye away from them
              for nothing. */}
          {nextKickoff && !weekRecap && (
            <div className="mt-6">
              <KickoffCountdown target={nextKickoff.toISOString()} />
            </div>
          )}
        </section>

        {/* Post-week recap: Week N wrap, Final scores, Team of the week.
            Leads the hub from the Tuesday week roll until the Thursday
            morning cron, on every screen size. */}
        {weekRecap && (
          <WeekRecapSection
            seasonYear={seasonYear}
            recap={weekRecap}
            superlatives={weeklySuperlatives}
            benchLeader={benchLeader}
          />
        )}

        {/* Game of the week */}
        {showGotw && gameOfWeek && gotw?.kicker && (
          <GameOfWeekSection
            matchup={gameOfWeek}
            h2h={h2hByMatchup.get(gameOfWeek.matchupId) ?? null}
            record={record}
            avatarOf={(id) => standingBy.get(id)?.avatarUrl ?? null}
            divisionLeaderStatus={gotw.divisionLeaderStatus}
            kicker={gotw.kicker}
            rivalryName={gotw.namedRivalry?.name ?? null}
            rivalryTagline={gotw.namedRivalry?.tagline ?? null}
            blurb={gotwBlurb}
            bookGame={bookGameByMatchup.get(gameOfWeek.matchupId) ?? null}
            meta={slateMetaNode}
          />
        )}

        {/* Rest of the slate: compact rows, each one link into The Book */}
        {restOfSlate.length > 0 && (
          <HubSection
            kicker={HUB_LABELS.restOfTheSlate}
            action={showGotw ? undefined : slateMetaNode}
          >
            <div className="card-surface divide-y divide-divider">
              {restOfSlate.map((m) => {
                const angle =
                  angleOverrideOf(m) ?? angleByMatchup.get(m.matchupId) ?? "";
                const bookGame = bookGameByMatchup.get(m.matchupId);
                const lineOf = (franchiseId: string): string | null => {
                  if (!bookGame) return null;
                  const side =
                    bookGame.home.franchiseId === franchiseId
                      ? bookGame.home
                      : bookGame.away.franchiseId === franchiseId
                        ? bookGame.away
                        : null;
                  return side ? formatSpread(side.spread) : null;
                };
                return (
                  <SlateCard
                    key={m.matchupId}
                    teamA={{
                      name: m.homeTeam.franchiseName,
                      slug: m.homeTeam.franchiseSlug,
                      abbreviation: m.homeTeam.franchiseAbbreviation,
                      brandingColor: m.homeTeam.franchiseBrandingColor,
                      avatarUrl: standingBy.get(m.homeTeam.franchiseId)?.avatarUrl ?? null,
                      line: lineOf(m.homeTeam.franchiseId),
                    }}
                    teamB={{
                      name: m.awayTeam.franchiseName,
                      slug: m.awayTeam.franchiseSlug,
                      abbreviation: m.awayTeam.franchiseAbbreviation,
                      brandingColor: m.awayTeam.franchiseBrandingColor,
                      avatarUrl: standingBy.get(m.awayTeam.franchiseId)?.avatarUrl ?? null,
                      line: lineOf(m.awayTeam.franchiseId),
                    }}
                    angle={angle}
                  />
                );
              })}
            </div>
          </HubSection>
        )}

        {/* Power rankings preview */}
        {powerPreview && <PowerPulseCard preview={powerPreview} />}

        {/* More this week: the three secondary modules behind disclosure rows */}
        <MoreThisWeek
          week={week}
          playersToWatch={playersToWatch}
          leagueMoves={leagueMoves}
          weekReceipts={weekReceipts}
        />

        {/* The smack feed: where members post (the composer is a session
            island), so it stays on the hub, last. */}
        <HubSection
          kicker={HUB_LABELS.smackFeed}
          action={
            smackFromDesk ? (
              <p className="text-caption text-text-tertiary">From the site desk</p>
            ) : undefined
          }
        >
          <SmackComposerSlot />
          {smackItems.length > 0 ? (
            <SmackFeed
              items={smackItems}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            />
          ) : (
            <p className="card-surface block p-4 text-body-sm text-text-tertiary">
              Nothing on the board right now.
            </p>
          )}
        </HubSection>
      </div>

      {/* Right rail (desktop only): Players to watch beside the headliner,
          plus last week's superlatives and bench blunder when the recap is
          not rendering (window closed, or prior week not fully complete). */}
      {railHasContent && (
        <aside className="hidden lg:flex lg:flex-col gap-8 lg:pt-2">
          {playersToWatch.length > 0 && <PlayersToWatchCard players={playersToWatch} />}
          {railFallbacks && weeklySuperlatives && (
            <WeekInBooksCard week={priorWeek} superlatives={weeklySuperlatives} />
          )}
          {railFallbacks && benchLeader && <BenchCallout leader={benchLeader} />}
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game of the Week section (resolves kicker + status from data)
// ---------------------------------------------------------------------------

function GameOfWeekSection({
  matchup,
  h2h,
  record,
  avatarOf,
  divisionLeaderStatus,
  kicker,
  rivalryName,
  rivalryTagline,
  blurb,
  bookGame,
  meta,
}: {
  matchup: PairedMatchup;
  h2h: { wins: number; losses: number; ties: number } | null;
  record: (id: string) => string;
  avatarOf: (id: string) => string | null;
  /** "1st in {Division}" by the seedTeams tiebreak chain (gotw-context). */
  divisionLeaderStatus: Map<string, string>;
  /** "{lead} · {stakes}", derived from the pick's reasons (gotw-context). */
  kicker: string;
  /** The named rivalry leading the kicker, when the pick is one. */
  rivalryName: string | null;
  /** The named rivalry's tagline when the pick is one. */
  rivalryTagline: string | null;
  blurb: string;
  /** The Book's priced line for this game, when one exists. */
  bookGame: BookGame | null;
  /** The schedule meta on the label row ("Week 12 · Kickoff Thursday"). */
  meta: React.ReactNode;
}) {
  const home = matchup.homeTeam;
  const away = matchup.awayTeam;

  // teamAcronym, not a .slice(0, 3): truncating a team name is not an
  // abbreviation scheme, and it was a third way of deriving a code alongside
  // the persisted column and the shared ladder (see CLAUDE.md).
  const homeAbbr = home.franchiseAbbreviation ?? teamAcronym(home.franchiseName);
  const awayAbbr = away.franchiseAbbreviation ?? teamAcronym(away.franchiseName);

  const h2hLine = h2h
    ? formatH2HLine(h2h, homeAbbr, awayAbbr)
    : "First-ever meeting";

  return (
    <HubSection kicker={HUB_LABELS.gameOfTheWeek} action={meta}>
      <GameOfTheWeekCard
        kicker={kicker}
        rivalryName={rivalryName}
        rivalryTagline={rivalryTagline}
        h2hLine={h2hLine}
        teamA={{
          name: home.franchiseName,
          slug: home.franchiseSlug,
          abbreviation: home.franchiseAbbreviation,
          brandingColor: home.franchiseBrandingColor,
          avatarUrl: avatarOf(home.franchiseId),
          record: record(home.franchiseId),
          status: divisionLeaderStatus.get(home.franchiseId) ?? null,
        }}
        teamB={{
          name: away.franchiseName,
          slug: away.franchiseSlug,
          abbreviation: away.franchiseAbbreviation,
          brandingColor: away.franchiseBrandingColor,
          avatarUrl: avatarOf(away.franchiseId),
          record: record(away.franchiseId),
          status: divisionLeaderStatus.get(away.franchiseId) ?? null,
        }}
        blurb={blurb}
        bookLine={bookGame ? bookLineText(bookGame) : null}
      />
    </HubSection>
  );
}

// ---------------------------------------------------------------------------
// More this week: disclosure rows (no client JS) in place of three inline
// modules. Each row looks like a link row (title, one-line summary,
// ChevronRight) and opens in place; there is no standalone page for these
// lists, so a real link would have had nowhere true to go.
// ---------------------------------------------------------------------------

const NAME_SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;

/** "Jahmyr Gibbs" -> "Gibbs", "Marvin Harrison Jr." -> "Harrison". */
function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  while (parts.length > 1 && NAME_SUFFIX.test(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] ?? name;
}

function MoreRow({
  title,
  summary,
  testId,
  className = "",
  children,
}: {
  title: string;
  summary: string;
  testId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <details data-testid={testId} className={`group ${className}`.trim()}>
      <summary
        className={`${HUB_ROW_LINK} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body-sm font-semibold text-text-primary">{title}</span>
          <span className="block truncate text-caption text-text-tertiary">
            <MonoNums text={summary} />
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          strokeWidth={2}
          className="size-4 shrink-0 text-text-tertiary transition-transform duration-150 group-open:rotate-90"
        />
      </summary>
      <div className="px-4 pt-2 pb-6">{children}</div>
    </details>
  );
}

function MoreThisWeek({
  week,
  playersToWatch,
  leagueMoves,
  weekReceipts,
}: {
  week: number;
  playersToWatch: PlayerToWatch[];
  leagueMoves: LeagueMove[];
  weekReceipts: WeekReceipt[];
}) {
  const hasPlayers = playersToWatch.length > 0;
  const hasMoves = leagueMoves.length > 0;
  const hasHistory = weekReceipts.length > 0;
  if (!hasPlayers && !hasMoves && !hasHistory) return null;
  // On desktop the rail shows Players to watch beside the headliner, so its
  // row here is phone-only. When it is the ONLY row, the whole module is.
  const phoneOnly = !hasMoves && !hasHistory;
  return (
    <HubSection kicker={HUB_LABELS.moreThisWeek} className={phoneOnly ? "lg:hidden" : ""}>
      <div className="card-surface divide-y divide-divider">
        {hasPlayers && (
          <MoreRow
            testId="more-players-to-watch"
            title={HUB_LABELS.playersToWatch}
            summary={playersToWatch.slice(0, 3).map((p) => lastName(p.name)).join(", ")}
            className="lg:hidden"
          >
            <PlayersToWatchRows players={playersToWatch} />
          </MoreRow>
        )}
        {hasMoves && (
          <MoreRow
            testId="more-league-moves"
            title={HUB_LABELS.leagueMoves}
            summary="Recent adds, drops and trades"
          >
            <LeagueMovesRows moves={leagueMoves} />
          </MoreRow>
        )}
        {hasHistory && (
          <MoreRow
            testId="more-week-history"
            title={HUB_LABELS.weekInHistory}
            summary={`Past Week ${week} results`}
          >
            <WeekInHistoryRows week={week} receipts={weekReceipts} />
          </MoreRow>
        )}
      </div>
    </HubSection>
  );
}

// ---------------------------------------------------------------------------
// Rail cards and the rows they share with "More this week"
// (shell + row rhythm live in components/hub/rail-card.tsx)
// ---------------------------------------------------------------------------

function RecapRow({
  label,
  desc,
  value,
  tone,
}: {
  label: string;
  /** ReactNode so a single-franchise recap row can link its identity; the
   * two-name rows ("X def. Y") stay plain strings. */
  desc: React.ReactNode;
  value: string;
  tone: "ink" | "gold" | "warm";
}) {
  const labelClass =
    tone === "gold"
      ? "text-accent-gold"
      : tone === "warm"
        ? "text-accent-warm"
        : "text-text-tertiary";
  const valueClass = tone === "warm" ? "text-accent-warm" : "text-text-primary";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-caption ${labelClass}`}>{label}</p>
        <div className="text-body-sm text-text-secondary truncate">{desc}</div>
      </div>
      <span className={`text-stat tabular-nums text-body ${valueClass} shrink-0`}>
        {value}
      </span>
    </div>
  );
}

/** The rail's stand-in for the recap when the recap is not rendering. */
function WeekInBooksCard({
  week,
  superlatives,
}: {
  week: number;
  superlatives: NonNullable<Awaited<ReturnType<typeof getWeeklySuperlatives>>>;
}) {
  const { highestScorer, biggestBlowout, closestWin, lowestScorer } = superlatives;
  if (!highestScorer && !biggestBlowout && !closestWin && !lowestScorer) {
    return null;
  }
  return (
    <HubSection
      kicker={`Week ${week} wrap`}
      action={
        <Link
          href="/matchups"
          className={`${buttonVariants({ variant: "quiet", size: "sm" })} -mr-3`}
        >
          Full recap
          <ChevronRight aria-hidden="true" strokeWidth={2} data-icon="inline-end" />
        </Link>
      }
    >
      <RailCard>
        <RailRows>
          {highestScorer && (
            <RecapRow
              label="High"
              desc={
                <TeamLink slug={highestScorer.franchiseSlug}>
                  {highestScorer.franchiseName}
                </TeamLink>
              }
              value={highestScorer.points.toFixed(1)}
              tone="gold"
            />
          )}
          {biggestBlowout && (
            <RecapRow
              label="Mercy"
              desc={`${biggestBlowout.winner} def. ${biggestBlowout.loser}`}
              value={biggestBlowout.margin.toFixed(1)}
              tone="warm"
            />
          )}
          {closestWin && (
            <RecapRow
              label="Close"
              desc={`${closestWin.winner} over ${closestWin.loser}`}
              value={`+${closestWin.margin.toFixed(1)}`}
              tone="ink"
            />
          )}
          {lowestScorer && (
            <RecapRow
              label="Stinker"
              desc={
                <TeamLink slug={lowestScorer.franchiseSlug}>
                  {lowestScorer.franchiseName}
                </TeamLink>
              }
              value={lowestScorer.points.toFixed(1)}
              tone="warm"
            />
          )}
        </RailRows>
      </RailCard>
    </HubSection>
  );
}

function PlayerToWatchRow({
  player,
  showStory,
  showProjected,
}: {
  player: PlayerToWatch;
  /** True when any player in the card carries a story detail. Rows render
   * only the lines they have (UI/UX pass 2026-11-24: reserved empty lines
   * left a visible gap beside the headliner). */
  showStory: boolean;
  /** True when any player in the card renders a projected line. */
  showProjected: boolean;
}) {
  return (
    <div>
      <PlayerLink
        playerId={player.playerId}
        className="flex min-h-11 items-center gap-3"
      >
        <PlayerHeadshot
          playerId={player.playerId}
          name={player.name}
          size={56}
          nflTeam={player.team}
        />
        <span className="min-w-0 flex-1">
          <span className="text-caption text-text-tertiary block">{sentenceCaseLabel(player.storyLabel)}</span>
          <span className="text-body-sm font-semibold text-text-primary truncate block">
            {player.name}
          </span>
          <span className="text-caption text-text-tertiary truncate block">
            {player.team ?? "FA"} &middot; {player.position ?? "?"}
          </span>
        </span>
      </PlayerLink>
      <div className="mt-2 space-y-1">
        {/* min-h reserves the region so every row is the same height; the
            clamp is the ceiling prod already shipped (3 lines), NOT a tighter
            one. Tightening it to 2 would newly clip a long story detail, and
            silently dropping the end of a real claim is worse than a row that
            runs one line taller than its neighbour. */}
        {showStory && player.storyDetail && (
          <p
            data-testid="ptw-story"
            className="text-body-sm text-text-secondary line-clamp-3"
          >
            {player.storyDetail && <MonoNums text={player.storyDetail} />}
          </p>
        )}
        {/* The Leap's storyDetail already states the projection and the
            baseline ppg, so a second line repeating the same two numbers is
            redundant. The row still reserves that line (empty) when a sibling
            renders one, so the rows stay the same height. Not clamped: a
            mid-season baseline label sits right at the wrap boundary, and a
            one-line clamp would silently drop "Week 12" off a real number. */}
        {showProjected && player.storyKey !== "leap" && (
          <p
            data-testid="ptw-projected"
            className="text-body-sm text-text-tertiary"
          >
            Projected{" "}
            <span className="text-stat tabular-nums text-text-secondary">
              {player.projectedPoints.toFixed(1)}
            </span>{" "}
            &middot; <MonoNums text={player.baselineLabel} />
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Every Players to watch row is a true claim built from the current week's
 * starter pool: this week's projection plus an honest prior-production
 * baseline (never "Standouts" before a game has been played).
 */
function PlayersToWatchRows({ players }: { players: PlayerToWatch[] }) {
  // Fixed structural regions: when any row carries a story detail (two lines)
  // or a projected line (one), EVERY row reserves the same space. It reserves
  // space, it never invents copy.
  const showStory = players.some((p) => Boolean(p.storyDetail));
  const showProjected = players.some((p) => p.storyKey !== "leap");
  return (
    <RailRows>
      {players.map((p) => (
        <PlayerToWatchRow
          key={p.playerId}
          player={p}
          showStory={showStory}
          showProjected={showProjected}
        />
      ))}
    </RailRows>
  );
}

/** The desktop rail's Players to watch card. Renders nothing when empty. */
function PlayersToWatchCard({ players }: { players: PlayerToWatch[] }) {
  if (players.length === 0) return null;
  return (
    <HubSection kicker={HUB_LABELS.playersToWatch}>
      <RailCard>
        <PlayersToWatchRows players={players} />
      </RailCard>
    </HubSection>
  );
}

/** "ADD" -> "Add": a text label beside the crest, never color alone. */
function moveKindLabel(kind: LeagueMove["kind"]): string {
  return kind.charAt(0) + kind.slice(1).toLowerCase();
}

/**
 * What the league actually did, straight from our own synced transactions
 * table (no live Sleeper call on a page path).
 */
function LeagueMovesRows({ moves }: { moves: LeagueMove[] }) {
  // Fixed structural region for the optional support line: when any move has
  // one, every row reserves exactly one line for it.
  const showSupport = moves.some((m) => m.support);
  return (
    <RailRows>
      {moves.map((move) => (
        <div key={move.transactionId} className="flex items-start gap-3">
          <PlayerLink playerId={move.headline.id} className="shrink-0">
            <PlayerHeadshot
              playerId={move.headline.id}
              name={move.headline.name}
              size={44}
              nflTeam={move.headline.nflTeam}
              decorative
            />
          </PlayerLink>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <PlayerLink playerId={move.headline.id} className="min-w-0">
                <p className="text-body-sm font-semibold text-text-primary truncate">
                  {move.headline.name}
                </p>
              </PlayerLink>
              {move.age && (
                <span className="text-caption text-text-tertiary shrink-0">
                  <MonoNums text={move.age} />
                </span>
              )}
            </div>
            <p className="text-caption text-text-tertiary truncate">
              {move.headline.position ?? "?"} &middot; {move.headline.nflTeam ?? "FA"}
            </p>
            <div className="mt-2 flex items-center gap-2" data-testid="move-kind-row">
              <span className="text-caption text-accent-gold shrink-0" data-testid="move-kind">
                {moveKindLabel(move.kind)}
              </span>
              <div className="flex shrink-0 -space-x-1.5">
                {move.franchises.map((f) => (
                  <FranchiseLogo
                    key={f.id}
                    slug={f.slug}
                    name={f.name}
                    abbreviation={f.abbreviation ?? undefined}
                    brandingColor={f.brandingColor ?? undefined}
                    avatarUrl={f.avatarUrl}
                    size={20}
                    decorative
                  />
                ))}
              </div>
              {/* Secondary attribution, clickable like every other franchise
                  identity on the site. The crests stay decorative because
                  these names sit right beside them. */}
              <span className="text-caption text-text-tertiary truncate">
                {move.franchises.map((f, i) => (
                  <span key={f.id}>
                    {i > 0 && " / "}
                    <TeamLink slug={f.slug} className="text-text-tertiary">
                      {f.name}
                    </TeamLink>
                  </span>
                ))}
              </span>
            </div>
            {showSupport && (
              <p className="mt-2 min-h-[1lh] text-body-sm text-text-secondary truncate">
                {move.support}
              </p>
            )}
          </div>
        </div>
      ))}
    </RailRows>
  );
}

/**
 * On-this-week receipts from past seasons: the highest score, the worst
 * beating, and the closest call this league has ever produced in this week
 * number. Every line is a real completed game (see lib/queries/week-history).
 */
function WeekInHistoryRows({
  week,
  receipts,
}: {
  week: number;
  receipts: WeekReceipt[];
}) {
  return (
    <RailRows>
      {receipts.map((r) => (
        <div key={`${r.kind}-${r.seasonYear}`}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-caption text-accent-gold">
              {r.label} &middot;{" "}
              <span className="font-mono tabular-nums">{r.seasonYear}</span> Week{" "}
              <span className="font-mono tabular-nums">{week}</span>
            </p>
            <span className="text-stat tabular-nums text-body text-text-primary shrink-0">
              {r.value}
            </span>
          </div>
          <p
            data-testid="week-history-claim"
            className="mt-2 text-body-sm text-text-secondary"
          >
            <MonoNums text={r.claim} />
          </p>
        </div>
      ))}
    </RailRows>
  );
}
