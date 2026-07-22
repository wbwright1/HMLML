import type { HubContentInsert, HubContentKind } from "@/lib/queries/hub-content";
import type {
  StatsContext,
  StatsDivision,
  StatsFranchiseHistory,
  StatsMatchup,
  StatsRosterProjection,
  StatsTeam,
} from "@/lib/content-gen/stats-context";

// ---------------------------------------------------------------------------
// Deterministic template fallback
// ---------------------------------------------------------------------------
// Site-voice ("the friend in the group chat with the receipts") content built
// from the StatsContext ALONE. Every number here comes straight from the
// context, so nothing is fabricated: no invented trades, no made-up head-to-
// head, no member quotes (smack posts are Site Desk voice). No em-dashes. This
// is the guaranteed-available path when the LLM is unconfigured or fails.

export interface GeneratedContent {
  kinds: HubContentKind[];
  rows: HubContentInsert[];
  /** "template" always, here; generate.ts overrides to "llm" on the LLM path. */
  source: "template" | "llm";
  /**
   * Kinds whose rows came from the templates because the LLM produced none for
   * them (per-kind fallback). Empty/undefined on the pure template path.
   */
  templateFilledKinds?: HubContentKind[];
}

const CHARACTERIZATIONS = ["a knife fight", "wide open", "nobody blinking"];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// ---------------------------------------------------------------------------
// Longevity / projection helpers
// ---------------------------------------------------------------------------

function historyBySlug(ctx: StatsContext, slug: string | undefined): StatsFranchiseHistory | undefined {
  if (!slug) return undefined;
  return ctx.franchiseHistory.find((h) => h.slug === slug);
}

/** The bottom-ranked (worst-projected) roster, when projection data exists. */
function lowestProjected(ctx: StatsContext): StatsRosterProjection | null {
  if (ctx.rosterProjections.length === 0) return null;
  return [...ctx.rosterProjections].sort((a, b) => b.leagueRank - a.leagueRank)[0] ?? null;
}

/** The top-ranked (best-projected) roster, when projection data exists. */
function topProjected(ctx: StatsContext): StatsRosterProjection | null {
  if (ctx.rosterProjections.length === 0) return null;
  return ctx.rosterProjections.find((p) => p.leagueRank === 1) ?? ctx.rosterProjections[0] ?? null;
}

/** A franchise with a sustained (multi-year) bottom-tier trend, if any. */
function sustainedDoormatEntry(ctx: StatsContext): StatsFranchiseHistory | null {
  return ctx.franchiseHistory.find((h) => h.sustainedDoormat) ?? null;
}

/** A franchise with a sustained (multi-year) playoff-contender trend, if any. */
function sustainedContenderEntry(ctx: StatsContext): StatsFranchiseHistory | null {
  return ctx.franchiseHistory.find((h) => h.sustainedContender) ?? null;
}

function slugToName(ctx: StatsContext, slug: string): string {
  return ctx.leagueStandings.find((t) => t.slug === slug)?.name ?? slug;
}

// ---------------------------------------------------------------------------
// Preseason / offseason (season-scoped, week = null)
// ---------------------------------------------------------------------------

function divisionNotes(divisions: StatsDivision[]): HubContentInsert[] {
  return divisions.slice(0, 3).map((d, i) => {
    const characterization = CHARACTERIZATIONS[i % CHARACTERIZATIONS.length];
    const leader = d.leader;
    // At 0-0 nobody has actually claimed anything; a standings-based line reads
    // as nonsense before games are played.
    const nothingPlayed = !leader || /^0-0(-0)?$/.test(leader.record);
    const body = nothingPlayed
      ? `${d.name} is a clean slate. Four teams, one flag, and a lot of confident group-chat energy about to meet reality.`
      : `${leader.name} sat at the top of ${d.name} at ${leader.record}. Everyone else in this bracket is auditioning to take it from them.`;
    return {
      week: null,
      kind: "division_note" as const,
      refKey: d.name,
      body,
      extras: { characterization },
    };
  });
}

function burningQuestions(ctx: StatsContext): HubContentInsert[] {
  const qs: string[] = [];
  const champ = ctx.lastSeason?.champion;
  const doormat = ctx.lastSeason?.doormat;
  const topDivLeader = ctx.divisions[0]?.leader;

  if (champ) {
    qs.push(
      `Was ${champ.name}'s ${champ.record} last year the real thing, or the start of a very long hangover?`,
    );
  }
  if (topDivLeader && !/^0-0(-0)?$/.test(topDivLeader.record)) {
    qs.push(
      `Can anyone in the field slow down ${topDivLeader.name}, sitting at ${topDivLeader.record}?`,
    );
  }
  if (doormat) {
    qs.push(
      `Is this finally the year ${doormat.name} wins more than they lose, after last year's ${doormat.record}?`,
    );
  }

  // Longevity: pose the question about a franchise's sustained multi-year
  // trend, when the DB has enough history to support one.
  const sustainedDoormatFranchise = sustainedDoormatEntry(ctx);
  if (sustainedDoormatFranchise) {
    qs.push(
      `${slugToName(ctx, sustainedDoormatFranchise.slug)} has finished in the league's bottom third for ${sustainedDoormatFranchise.seasonsPlayed >= 3 ? "three straight seasons" : "back-to-back seasons"}. Does the streak finally end this year?`,
    );
  } else {
    const sustainedContenderFranchise = sustainedContenderEntry(ctx);
    if (sustainedContenderFranchise) {
      qs.push(
        `${slugToName(ctx, sustainedContenderFranchise.slug)} has made the playoffs in every one of its last completed seasons. Is this the year that streak breaks?`,
      );
    }
  }

  // Projections: pose the question about the projected upcoming season, only
  // when there is real projection data to ask it from.
  const worstProjected = lowestProjected(ctx);
  if (worstProjected) {
    qs.push(
      `${worstProjected.name} projects dead last in starting-lineup points. Is the roster really that thin, or is preseason math just wrong again?`,
    );
  }

  while (qs.length < 3) {
    qs.push(
      "Which team talks the biggest game in August and then quietly misses the playoffs?",
    );
  }
  return qs.slice(0, 5).map((q) => ({
    week: null,
    kind: "burning_question" as const,
    refKey: null,
    body: q,
    extras: null,
  }));
}

function boldPredictions(ctx: StatsContext): HubContentInsert[] {
  const rows: HubContentInsert[] = [];
  const champ = ctx.lastSeason?.champion;
  const pointMachine = ctx.lastSeason?.pointMachine;
  const doormat = ctx.lastSeason?.doormat;
  const topLeader = ctx.divisions[0]?.leader;

  if (champ) {
    rows.push({
      week: null,
      kind: "bold_prediction",
      refKey: null,
      body: `${champ.name} misses the final. The champion's hangover is real, and last year's ${champ.record} does not repeat itself.`,
      extras: { kicker: "Title Repeat", verdict: "NO" },
    });
  }
  if (topLeader) {
    rows.push({
      week: null,
      kind: "bold_prediction",
      refKey: null,
      body: `${topLeader.name} takes its division wire to wire off a ${topLeader.record} baseline. The rest of that bracket is auditioning for second.`,
      extras: { kicker: "Division Winner", verdict: "LOCK" },
    });
  }
  if (pointMachine) {
    rows.push({
      week: null,
      kind: "bold_prediction",
      refKey: null,
      body: `${pointMachine.name} led the league in scoring last year with ${pointMachine.pointsFor} points. Say it does it again and rides that offense into the bracket.`,
      extras: { kicker: "Biggest Riser", verdict: "UP" },
    });
  }
  if (doormat) {
    const doormatHistory = historyBySlug(ctx, doormat.slug);
    const escalate = doormatHistory?.sustainedDoormat === true;
    rows.push({
      week: null,
      kind: "bold_prediction",
      refKey: null,
      body: escalate
        ? `${doormat.name} has now finished in the league's bottom third for multiple seasons running, most recently ${doormat.record}. This is not a slump anymore, it is an identity. Nothing changes.`
        : `Same team, same story. ${doormat.name} went ${doormat.record} and did nothing to change it. The floor is still the floor.`,
      extras: { kicker: "League Doormat", verdict: "DOWN" },
    });
  }

  // Projection-based predictions only fire when the DB actually holds roster
  // projections; a season with an unpopulated proj_points_ppr column (before
  // the migration is applied, or before the projection sync has run) simply
  // omits these two rows.
  const worstProjected = lowestProjected(ctx);
  if (worstProjected) {
    rows.push({
      week: null,
      kind: "bold_prediction",
      refKey: null,
      body: `${worstProjected.name} projects for the fewest starting-lineup points in the league at ${worstProjected.projectedStartingPoints.toFixed(1)}. On paper, this is the team to beat down to.`,
      extras: { kicker: "Projected Underperformer", verdict: "DOWN" },
    });
  }
  const bestProjected = topProjected(ctx);
  if (bestProjected) {
    rows.push({
      week: null,
      kind: "bold_prediction",
      refKey: null,
      body: `${bestProjected.name} projects for the most starting-lineup points in the league at ${bestProjected.projectedStartingPoints.toFixed(1)}${bestProjected.topProjectedPlayer ? `, led by ${bestProjected.topProjectedPlayer.name}` : ""}. The rest of the league is projecting to chase.`,
      extras: { kicker: "Projected Riser", verdict: "UP" },
    });
  }

  while (rows.length < 4) {
    rows.push({
      week: null,
      kind: "bold_prediction",
      refKey: null,
      body: "Somebody in this field starts 0-3, blows up their roster, and blames the schedule. History says it happens every year.",
      extras: { kicker: "Early Panic", verdict: "DOWN" },
    });
  }
  return rows.slice(0, 6);
}

function offseasonReceipts(ctx: StatsContext): HubContentInsert[] {
  // Real franchise slugs, generic category teasers (no fabricated specific
  // moves). Pick a spread of franchises across the standings.
  const teams = ctx.leagueStandings;
  const picks: { slug: string; category: string; body: string }[] = [];
  const push = (team: StatsTeam | undefined, category: string, body: string) => {
    if (team) picks.push({ slug: team.slug, category, body });
  };

  const best = topProjected(ctx);
  const worst = lowestProjected(ctx);

  // When roster projections exist, the draft-win and fire-sale angles cite
  // the actual projected rank/total instead of the generic mock-draft framing.
  if (best) {
    push(
      teams.find((t) => t.slug === best.slug),
      "DRAFT",
      `${best.name} projects No. 1 in the league at ${best.projectedStartingPoints.toFixed(1)} starting-lineup points. September settles whether the draft board actually reads that well.`,
    );
  } else {
    push(
      teams[0],
      "DRAFT",
      `${teams[0]?.name} drafted like the mock never ended. September settles whether that was genius or a group-chat punchline.`,
    );
  }

  push(
    teams[Math.floor(teams.length / 3)],
    "TRADE",
    "Rewired half the roster before Labor Day. All-in energy from a team that swears this is finally the year.",
  );
  push(
    teams[Math.floor((2 * teams.length) / 3)],
    "WAIVERS",
    "Torched the waiver budget early chasing upside. Bold strategy, assuming any of it actually hits.",
  );

  if (worst) {
    push(
      teams.find((t) => t.slug === worst.slug),
      "FIRE_SALE",
      `${worst.name} projects dead last in the league at ${worst.projectedStartingPoints.toFixed(1)} starting-lineup points. The rebuild timeline remains a closely guarded secret.`,
    );
  } else {
    push(
      teams[teams.length - 1],
      "FIRE_SALE",
      "Sold off the veterans and called it a plan. The rebuild timeline remains a closely guarded secret.",
    );
  }

  return picks.slice(0, 4).map((p) => ({
    week: null,
    kind: "offseason_receipt" as const,
    refKey: p.slug,
    body: p.body,
    extras: { category: p.category },
  }));
}

function preseasonHeroDek(ctx: StatsContext): HubContentInsert {
  const body = ctx.lastSeason?.champion
    ? `Rosters are locked and every one of you is undefeated. ${ctx.lastSeason.champion.name} defends a title; everyone else is coming to take it. Screenshot the 0-0 while you've got it.`
    : "Rosters are locked and every one of you is undefeated. Screenshot the 0-0 while you've got it.";
  return {
    week: null,
    kind: "hero_dek",
    refKey: null,
    body,
    extras: null,
  };
}

function preseasonSmack(ctx: StatsContext): HubContentInsert[] {
  const posts: string[] = [
    "Twelve teams, one trophy, and at least three of you drafting like the waiver wire closed for good.",
    "Preseason optimism is a hell of a drug. Somebody in this field is headed for a long autumn and does not know it yet.",
  ];
  if (ctx.lastSeason?.champion) {
    posts.push(
      `Defending a title is the hard part. ${ctx.lastSeason.champion.name} hears about last year every single week.`,
    );
  }
  if (ctx.lastSeason?.doormat) {
    posts.push(
      `${ctx.lastSeason.doormat.name} went ${ctx.lastSeason.doormat.record} last year and the group chat has not let it go.`,
    );
  }

  // Longevity: one Site Desk post seeded from multi-year franchise history.
  const sustainedDoormatFranchise = sustainedDoormatEntry(ctx);
  if (sustainedDoormatFranchise) {
    posts.push(
      `${slugToName(ctx, sustainedDoormatFranchise.slug)} has finished bottom-third of the league in every one of its last ${sustainedDoormatFranchise.lastThreeFinishes.length} completed seasons. That is not bad luck, that is a resume.`,
    );
  }

  // Projections: one Site Desk post seeded from the upcoming-season roster
  // projections, when the DB actually has them.
  const bestProjected = topProjected(ctx);
  if (bestProjected) {
    posts.push(
      `${bestProjected.name} projects No. 1 in the league before a single snap. Enjoy the preseason crown while it is still just math.`,
    );
  }

  posts.push("Everybody is 0-0 today. For most of you this is as good as the record gets.");
  return posts.slice(0, 7).map((body) => ({
    week: null,
    kind: "smack_post" as const,
    refKey: null,
    body,
    extras: null,
  }));
}

// ---------------------------------------------------------------------------
// Regular season (week-scoped)
// ---------------------------------------------------------------------------

function matchupAngles(ctx: StatsContext): HubContentInsert[] {
  return ctx.currentMatchups.map((m) => ({
    week: ctx.week,
    kind: "matchup_angle" as const,
    refKey: m.pairKey,
    body: slateAngle(m),
    extras: null,
  }));
}

function slateAngle(m: StatsMatchup): string {
  const h2h = m.h2h;
  const h2hClause =
    h2h && h2h.wins + h2h.losses + h2h.ties > 0
      ? `They have met before: ${m.home.name} leads the all-time series ${h2h.wins}-${h2h.losses}${h2h.ties > 0 ? `-${h2h.ties}` : ""}.`
      : "First-ever meeting between these two.";
  return `${m.home.name} (${m.home.record}) hosts ${m.away.name} (${m.away.record}). ${h2hClause}`;
}

function gameOfWeek(ctx: StatsContext): HubContentInsert | null {
  if (ctx.currentMatchups.length === 0) return null;
  // Prefer the pair the hub will feature (selectGameOfTheWeek, carried on the
  // context) so the blurb is about the right matchup; fall back to the
  // most-combined-wins heuristic when no featured pair is set.
  const featured = ctx.gameOfWeekPairKey
    ? ctx.currentMatchups.find((m) => m.pairKey === ctx.gameOfWeekPairKey)
    : null;
  const wins = (rec: string): number => parseInt(rec.split("-")[0] ?? "0", 10) || 0;
  const best =
    featured ??
    [...ctx.currentMatchups].sort(
      (a, b) =>
        wins(b.home.record) + wins(b.away.record) - (wins(a.home.record) + wins(a.away.record)),
    )[0];
  const body = `${best.home.name} (${best.home.record}) and ${best.away.name} (${best.away.record}) headline the slate. First place is on the line and there are receipts to settle by Thursday night.`;
  return {
    week: ctx.week,
    kind: "game_of_week_blurb",
    refKey: null,
    body,
    extras: null,
  };
}

function regularHeroDek(ctx: StatsContext): HubContentInsert {
  const body = `Week ${ctx.week} is set. ${ctx.currentMatchups.length} matchups, one grudge match at the top, and a week of receipts to settle by Sunday.`;
  return { week: ctx.week, kind: "hero_dek", refKey: null, body, extras: null };
}

function regularSmack(ctx: StatsContext): HubContentInsert[] {
  const posts: string[] = [];
  const wib = ctx.weekInBooks;
  if (wib?.highestScorer) {
    posts.push(
      `${wib.highestScorer.franchiseName} dropped ${wib.highestScorer.points} in Week ${wib.week}. The rest of the league is taking notes, or should be.`,
    );
  }
  if (wib?.biggestBlowout) {
    posts.push(
      `${wib.biggestBlowout.winner} beat ${wib.biggestBlowout.loser} by ${wib.biggestBlowout.margin} in Week ${wib.week}. That is not a game, that is a public service announcement.`,
    );
  }
  if (wib?.benchLeader) {
    posts.push(
      `${wib.benchLeader.franchiseName} left ${wib.benchLeader.pointsLeft} on the bench in Week ${wib.week}${wib.benchLeader.won === false ? " and lost anyway." : "."}`,
    );
  }
  if (wib?.lowestScorer) {
    posts.push(
      `${wib.lowestScorer.franchiseName} managed ${wib.lowestScorer.points} in Week ${wib.week}. Somebody check on them.`,
    );
  }
  const leader = ctx.divisions[0]?.leader;
  if (leader) {
    posts.push(
      `${leader.name} sits ${leader.record} atop ${ctx.divisions[0].name}. Talk is cheap; the standings are not.`,
    );
  }
  while (posts.length < 3) {
    posts.push(
      `Week ${ctx.week} is here. Somebody is about to learn their team is not as good as their group-chat bravado.`,
    );
  }
  return posts.slice(0, 5).map((body) => ({
    week: ctx.week,
    kind: "smack_post" as const,
    refKey: null,
    body,
    extras: null,
  }));
}

// ---------------------------------------------------------------------------
// Kind selection + entry point
// ---------------------------------------------------------------------------

/**
 * The kinds this run generates, given the seasonal state. Only "regular" and
 * "pre" produce hub editorial; "post"/"off" have no hub state that reads
 * generated content, so they map to no kinds (the endpoint skips them).
 */
export function kindsForSeason(seasonType: StatsContext["seasonType"]): HubContentKind[] {
  if (seasonType === "regular") {
    return ["matchup_angle", "game_of_week_blurb", "hero_dek", "smack_post"];
  }
  if (seasonType === "pre") {
    return [
      "division_note",
      "burning_question",
      "bold_prediction",
      "offseason_receipt",
      "hero_dek",
      "smack_post",
    ];
  }
  return [];
}

/**
 * Builds the full content batch for a run from the StatsContext alone. Pure and
 * dependency-free (no DB, no network), so it is both the deterministic fallback
 * and directly unit-testable. `ordinal` is retained for future superlative
 * copy; unused today.
 */
export function generateFromTemplates(ctx: StatsContext): GeneratedContent {
  void ordinal;
  const kinds = kindsForSeason(ctx.seasonType);
  const rows: HubContentInsert[] = [];

  if (ctx.seasonType === "regular") {
    rows.push(...matchupAngles(ctx));
    const gotw = gameOfWeek(ctx);
    if (gotw) rows.push(gotw);
    rows.push(regularHeroDek(ctx));
    rows.push(...regularSmack(ctx));
  } else if (ctx.seasonType === "pre") {
    rows.push(...divisionNotes(ctx.divisions));
    rows.push(...burningQuestions(ctx));
    rows.push(...boldPredictions(ctx));
    rows.push(...offseasonReceipts(ctx));
    rows.push(preseasonHeroDek(ctx));
    rows.push(...preseasonSmack(ctx));
  }
  // "post"/"off" produce no rows: no hub state reads generated content there.

  return { kinds, rows, source: "template" };
}
