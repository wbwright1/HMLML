import type { HubContentInsert, HubContentKind } from "@/lib/queries/hub-content";
import type {
  StatsContext,
  StatsDivision,
  StatsFranchiseHistory,
  StatsMatchup,
  StatsRosterProjection,
  StatsTrade,
  StatsTradeSide,
} from "@/lib/content-gen/stats-context";
import { validateRow } from "@/lib/content-gen/validate";
import { FRANCHISE_UNIQUE_KINDS, selectDiverseSubset } from "@/lib/content-gen/dedupe";

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
  /**
   * Observability for the diversity/validation layer (applyDiversityLayer):
   * how many candidate rows were dropped as duplicates/invalid, and which
   * kinds had to relax their cap to avoid shipping empty. Logged to
   * sync_log.detailsJson by the generate-content route.
   */
  diversityStats?: { droppedCount: number; relaxedKinds: HubContentKind[] };
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
  const bestProjected = topProjected(ctx);
  if (bestProjected) {
    qs.push(
      `${bestProjected.name} projects No. 1 in starting-lineup points before a snap is played. Does that hold up, or is preseason math about to get embarrassed?`,
    );
  }

  while (qs.length < 3) {
    qs.push(
      "Which team talks the biggest game in August and then quietly misses the playoffs?",
    );
  }
  // No cap here: the candidate pool is trimmed to its display target (and
  // deduped against every other module's rows) by applyDiversityLayer.
  return qs.map((q) => ({
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
  // Only cite a division "baseline" once games have been played; at 0-0 the
  // leader slot is alphabetical noise and the line reads as a claimed result.
  if (topLeader && !/^0-0(-0)?$/.test(topLeader.record)) {
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
  // No cap here: trimmed to its display target by applyDiversityLayer.
  return rows;
}

/**
 * Builds offseason_receipt candidates that cite REAL offseason moves
 * (draft_picks / offseason trades) whenever the DB has them. Projection-only
 * framing is used ONLY as the fallback when ctx.offseasonMoves has no
 * activity for a franchise (e.g. before draft-day sync or before the
 * projection migration lands). Drafted-player picks are cited in draft
 * ORDER (earliest pick first, per buildOffseasonMoves), and this function
 * actively varies the position cited across franchises so a run of receipts
 * doesn't read as "everyone drafted a QB."
 */
function offseasonReceipts(ctx: StatsContext): HubContentInsert[] {
  const teams = ctx.leagueStandings;
  const moves = ctx.offseasonMoves;
  type Pick = { slug: string; category: string; body: string };

  const best = topProjected(ctx);
  const worst = lowestProjected(ctx);

  // DRAFT: one candidate per franchise with a real draft pick on file, citing
  // the earliest pick whose position hasn't already been cited elsewhere in
  // this run (falling back to that franchise's earliest pick otherwise).
  const draftCandidates = moves.filter((m) => m.draftedPlayers.length > 0);
  const draftPicks: Pick[] = [];
  const usedPositions = new Set<string>();
  for (const m of draftCandidates) {
    const pick =
      m.draftedPlayers.find((p) => !p.position || !usedPositions.has(p.position)) ??
      m.draftedPlayers[0];
    usedPositions.add(pick.position ?? "");
    const posLabel = pick.position ? `${pick.position} ` : "";
    draftPicks.push({
      slug: m.slug,
      category: "DRAFT",
      body: `${m.name} took ${posLabel}${pick.playerName} with pick No. ${pick.pickNumber} (Round ${pick.round}). September settles whether that pick reads as genius or a group-chat punchline.`,
    });
  }
  if (draftCandidates.length === 0) {
    if (best) {
      const team = teams.find((t) => t.slug === best.slug);
      if (team) {
        draftPicks.push({
          slug: team.slug,
          category: "DRAFT",
          body: `${best.name} projects No. 1 in the league at ${best.projectedStartingPoints.toFixed(1)} starting-lineup points. September settles whether the draft board actually reads that well.`,
        });
      }
    } else if (teams[0]) {
      draftPicks.push({
        slug: teams[0].slug,
        category: "DRAFT",
        body: `${teams[0].name} drafted like the mock never ended. September settles whether that was genius or a group-chat punchline.`,
      });
    }
  }

  // TRADE: one candidate per franchise with a real offseason trade on file,
  // citing the actual assets exchanged.
  const tradeCandidates = moves.filter((m) => m.trades.length > 0);
  const tradePicks: Pick[] = [];
  for (const m of tradeCandidates) {
    const trade = m.trades[0];
    const acquired = [...trade.acquired.players, ...trade.acquired.picks];
    const surrendered = [...trade.surrendered.players, ...trade.surrendered.picks];
    if (acquired.length === 0 && surrendered.length === 0) continue;
    const acquiredLabel = acquired.length > 0 ? acquired.join(", ") : "a stack of picks";
    const surrenderedLabel = surrendered.length > 0 ? surrendered.join(", ") : "a pile of depth pieces";
    tradePicks.push({
      slug: m.slug,
      category: "TRADE",
      body: `${m.name} sent out ${surrenderedLabel} to bring in ${acquiredLabel}. All-in energy from a team that swears this is finally the year.`,
    });
  }
  if (tradeCandidates.length === 0) {
    const midTeam = teams[Math.floor(teams.length / 3)];
    if (midTeam) {
      tradePicks.push({
        slug: midTeam.slug,
        category: "TRADE",
        body: "Rewired half the roster before Labor Day. All-in energy from a team that swears this is finally the year.",
      });
    }
  }

  // WAIVERS: no waiver-specific data source exists yet, so this stays
  // category-generic; the franchise cited is still real.
  const waiverPicks: Pick[] = [];
  const waiverTeam = teams[Math.floor((2 * teams.length) / 3)];
  if (waiverTeam) {
    waiverPicks.push({
      slug: waiverTeam.slug,
      category: "WAIVERS",
      body: "Torched the waiver budget early chasing upside. Bold strategy, assuming any of it actually hits.",
    });
  }

  // FIRE_SALE: a franchise whose real offseason trade gave up more players
  // than it got back, else fall back to the worst-projected framing, else
  // the fully generic line.
  const fireSalePicks: Pick[] = [];
  const fireSaleCandidate = moves.find(
    (m) =>
      m.trades.length > 0 &&
      m.trades[0].surrendered.players.length > m.trades[0].acquired.players.length,
  );
  if (fireSaleCandidate) {
    const trade = fireSaleCandidate.trades[0];
    fireSalePicks.push({
      slug: fireSaleCandidate.slug,
      category: "FIRE_SALE",
      body: `${fireSaleCandidate.name} shipped out ${trade.surrendered.players.join(", ") || "the veterans"} for spare parts. The rebuild timeline remains a closely guarded secret.`,
    });
  } else if (worst) {
    const team = teams.find((t) => t.slug === worst.slug);
    if (team) {
      fireSalePicks.push({
        slug: team.slug,
        category: "FIRE_SALE",
        body: `${worst.name} projects dead last in the league at ${worst.projectedStartingPoints.toFixed(1)} starting-lineup points. The rebuild timeline remains a closely guarded secret.`,
      });
    }
  } else if (teams[teams.length - 1]) {
    fireSalePicks.push({
      slug: teams[teams.length - 1].slug,
      category: "FIRE_SALE",
      body: "Sold off the veterans and called it a plan. The rebuild timeline remains a closely guarded secret.",
    });
  }

  // Interleave the 4 categories round-robin (rather than concatenating
  // DRAFT-then-TRADE-then-WAIVERS-then-FIRE_SALE) so that when a real league
  // has many more DRAFT candidates than the display target, the trimmed-down
  // final set still spans all 4 categories instead of the pool being
  // dominated by whichever category happened to be built first.
  const buckets = [draftPicks, tradePicks, waiverPicks, fireSalePicks];
  const picks: Pick[] = [];
  const maxLen = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < maxLen; i++) {
    for (const bucket of buckets) {
      if (bucket[i]) picks.push(bucket[i]);
    }
  }

  // No cap here: trimmed to its display target by applyDiversityLayer.
  return picks.map((p) => ({
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
  const worstProjectedForSmack = lowestProjected(ctx);
  if (worstProjectedForSmack) {
    posts.push(
      `${worstProjectedForSmack.name} projects dead last before a single snap. The preseason math is already unkind.`,
    );
  }

  posts.push("Everybody is 0-0 today. For most of you this is as good as the record gets.");
  // No cap here: the pool is trimmed to its display target by applyDiversityLayer.
  return posts.map((body) => ({
    week: null,
    kind: "smack_post" as const,
    refKey: null,
    body,
    extras: null,
  }));
}

// ---------------------------------------------------------------------------
// Offseason (season-scoped, week = null) — deliberately lightweight
// ---------------------------------------------------------------------------
// The owner's instruction: keep the offseason side light. When little has
// changed the whole run is skipped by the activity gate in the route; when it
// does run, it produces a small recap/lookahead set plus per-trade verdicts.

function offseasonHeroDek(ctx: StatsContext): HubContentInsert {
  const champ = ctx.lastSeason?.champion;
  const body = champ
    ? `The ${ctx.lastSeason?.year} season is in the books, ${champ.name} has the ring, and everyone else is already rewriting their roster in the group chat. The offseason is where next year's receipts get printed.`
    : `The season is in the books and the offseason is where next year's receipts get printed. Every roster move now is a promise somebody will be held to in the fall.`;
  return { week: null, kind: "hero_dek", refKey: null, body, extras: null };
}

function offseasonSmack(ctx: StatsContext): HubContentInsert[] {
  const posts: string[] = [
    "The offseason is undefeated. Every team is a contender in a group chat and nowhere else.",
    "Roster moves are cheap in the offseason. Come the fall, somebody has to actually start these guys.",
  ];
  if (ctx.lastSeason?.champion) {
    posts.push(
      `${ctx.lastSeason.champion.name} won it all and now gets to defend it. The target does not get smaller in the offseason.`,
    );
  }
  if (ctx.lastSeason?.doormat) {
    posts.push(
      `${ctx.lastSeason.doormat.name} went ${ctx.lastSeason.doormat.record} and has a whole offseason to convince the group chat it was bad luck.`,
    );
  }
  const sustainedDoormatFranchise = sustainedDoormatEntry(ctx);
  if (sustainedDoormatFranchise) {
    posts.push(
      `${slugToName(ctx, sustainedDoormatFranchise.slug)} has been bottom-third for multiple seasons running. An offseason of bold talk does not undo a resume.`,
    );
  }
  // No cap here: trimmed to its display target by applyDiversityLayer.
  return posts.map((body) => ({
    week: null,
    kind: "smack_post" as const,
    refKey: null,
    body,
    extras: null,
  }));
}

/**
 * A deterministic, hedged "who won this trade" line per recent trade, derived
 * ONLY from the assets each side received: how many players, how much draft
 * capital. No value model exists, so the copy never declares a settled winner;
 * it leans on volume and on the win-now-vs-future split, always with a "graded
 * later" hedge. refKey is the trade's transaction id, so /trades can attach the
 * verdict to the right card. Player positions/names are intentionally NOT named
 * here (avoids position-claim/hallucination flags); the take is about shape.
 */
function tradeVerdicts(ctx: StatsContext): HubContentInsert[] {
  return ctx.recentTrades.map((t) => ({
    week: null,
    kind: "trade_verdict" as const,
    refKey: String(t.id),
    body: verdictLine(t),
    extras: null,
  }));
}

function assetCount(side: StatsTradeSide): number {
  return side.players.length + side.picks;
}

function verdictLine(t: StatsTrade): string {
  const sides = t.sides;
  if (sides.length !== 2) {
    return "A multi-team deal with enough moving parts that nobody in the group chat will ever agree who won it. Grade it once the standings weigh in.";
  }
  const [a, b] = sides;
  const aName = a.franchiseName ?? "One side";
  const bName = b.franchiseName ?? "the other side";
  const aTotal = assetCount(a);
  const bTotal = assetCount(b);
  const diff = aTotal - bTotal;

  if (Math.abs(diff) >= 2) {
    const more = diff > 0 ? a : b;
    const less = diff > 0 ? b : a;
    const moreName = more.franchiseName ?? "one side";
    const lessName = less.franchiseName ?? "the other";
    const moreN = assetCount(more);
    const lessN = assetCount(less);
    return `${moreName} walked away with ${moreN} ${moreN === 1 ? "piece" : "pieces"} to ${lessName}'s ${lessN}. Early returns favor the side that got more bodies, though a lopsided haul on paper has flattered plenty of GMs before.`;
  }

  const aPickHeavy = a.picks > a.players.length;
  const bPickHeavy = b.picks > b.players.length;
  if (aPickHeavy !== bPickHeavy) {
    const future = aPickHeavy ? a : b;
    const now = aPickHeavy ? b : a;
    const futureName = future.franchiseName ?? "one side";
    const nowName = now.franchiseName ?? "the other";
    return `${futureName} banked the draft capital while ${nowName} took the win-now pieces. Whether patience or urgency wins this one is a story for a later season, not this week.`;
  }

  return `${aName} and ${bName} both gave up real value here, and both are already calling it a steal. Too even to grade until the points do the talking in the fall.`;
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
 * The kinds this run generates, given the seasonal state. "regular" and "pre"
 * produce the full hub editorial; "off" produces a deliberately lightweight
 * set (season-scoped receipts/dek/smack that the preseason hub reads, plus
 * per-trade verdicts rendered on /trades). "post" (the playoffs) still maps to
 * no kinds and the endpoint skips it.
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
  if (seasonType === "off") {
    return ["offseason_receipt", "hero_dek", "smack_post", "trade_verdict"];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Diversity layer wiring
// ---------------------------------------------------------------------------

/**
 * Validates every candidate row (dropping anything that fails validateRow),
 * then picks a diverse, non-repeating subset per kind via selectDiverseSubset.
 * The per-kind functions above deliberately over-generate (more candidates
 * than the display target) so this has real room to pick the most distinct
 * hooks instead of just truncating in generation order.
 */
function applyDiversityLayer(
  ctx: StatsContext,
  candidatesByKind: Partial<Record<HubContentKind, HubContentInsert[]>>,
  targetCountsByKind: Partial<Record<HubContentKind, number>>,
): { rows: HubContentInsert[]; diversityStats: { droppedCount: number; relaxedKinds: HubContentKind[] } } {
  const validatedByKind: Partial<Record<HubContentKind, HubContentInsert[]>> = {};
  let invalidCount = 0;
  for (const kind of Object.keys(candidatesByKind) as HubContentKind[]) {
    const all = candidatesByKind[kind] ?? [];
    const valid = all.filter((row) => validateRow(row, ctx).valid);
    invalidCount += all.length - valid.length;
    validatedByKind[kind] = valid;
  }
  const { kept, dropped, relaxedKinds } = selectDiverseSubset(validatedByKind, ctx, {
    targetCountsByKind,
    kindPriority: Object.keys(validatedByKind) as HubContentKind[],
    franchiseUniqueKinds: FRANCHISE_UNIQUE_KINDS,
  });
  return {
    rows: kept as HubContentInsert[],
    diversityStats: { droppedCount: invalidCount + dropped.length, relaxedKinds },
  };
}

/**
 * Builds the full content batch for a run from the StatsContext alone. Pure and
 * dependency-free (no DB, no network), so it is both the deterministic fallback
 * and directly unit-testable. `ordinal` is retained for future superlative
 * copy; unused today.
 *
 * Every kind's candidates are validated and run through the diversity
 * selector before shipping: no two rows in the batch should share the same
 * franchise + number hook, and matchup_angle always keeps every current
 * matchup (its target is the full candidate count, since every matchup needs
 * a card).
 */
export function generateFromTemplates(ctx: StatsContext): GeneratedContent {
  void ordinal;
  const kinds = kindsForSeason(ctx.seasonType);

  if (ctx.seasonType === "regular") {
    const matchupCandidates = matchupAngles(ctx);
    const gotw = gameOfWeek(ctx);
    const smackCandidates = regularSmack(ctx);
    const candidatesByKind: Partial<Record<HubContentKind, HubContentInsert[]>> = {
      matchup_angle: matchupCandidates,
      game_of_week_blurb: gotw ? [gotw] : [],
      hero_dek: [regularHeroDek(ctx)],
      smack_post: smackCandidates,
    };
    const targetCountsByKind: Partial<Record<HubContentKind, number>> = {
      matchup_angle: matchupCandidates.length,
      game_of_week_blurb: gotw ? 1 : 0,
      hero_dek: 1,
      smack_post: 5,
    };
    const { rows, diversityStats } = applyDiversityLayer(ctx, candidatesByKind, targetCountsByKind);
    return { kinds, rows, source: "template", diversityStats };
  }

  if (ctx.seasonType === "pre") {
    const candidatesByKind: Partial<Record<HubContentKind, HubContentInsert[]>> = {
      division_note: divisionNotes(ctx.divisions),
      burning_question: burningQuestions(ctx),
      bold_prediction: boldPredictions(ctx),
      offseason_receipt: offseasonReceipts(ctx),
      hero_dek: [preseasonHeroDek(ctx)],
      smack_post: preseasonSmack(ctx),
    };
    const targetCountsByKind: Partial<Record<HubContentKind, number>> = {
      division_note: 3,
      burning_question: 3,
      bold_prediction: 6,
      offseason_receipt: 4,
      hero_dek: 1,
      smack_post: 5,
    };
    const { rows, diversityStats } = applyDiversityLayer(ctx, candidatesByKind, targetCountsByKind);
    return { kinds, rows, source: "template", diversityStats };
  }

  if (ctx.seasonType === "off") {
    const receipts = offseasonReceipts(ctx);
    const verdicts = tradeVerdicts(ctx);
    const candidatesByKind: Partial<Record<HubContentKind, HubContentInsert[]>> = {
      offseason_receipt: receipts,
      hero_dek: [offseasonHeroDek(ctx)],
      smack_post: offseasonSmack(ctx),
      trade_verdict: verdicts,
    };
    const targetCountsByKind: Partial<Record<HubContentKind, number>> = {
      offseason_receipt: 4,
      hero_dek: 1,
      smack_post: 3,
      // Every recent trade gets its own verdict (keep-all, like matchup_angle).
      trade_verdict: verdicts.length,
    };
    const { rows, diversityStats } = applyDiversityLayer(ctx, candidatesByKind, targetCountsByKind);
    return { kinds, rows, source: "template", diversityStats };
  }

  // "post" (the playoffs) produces no rows: no hub state reads generated
  // content there, and kindsForSeason maps it to no kinds.
  return { kinds, rows: [], source: "template" };
}
