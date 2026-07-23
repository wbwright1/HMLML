import {
  getPublishedHubContent,
  type GroupedHubContent,
} from "@/lib/queries/hub-content";

export type LabelTone = 'positive' | 'sting' | 'neutral';

export interface SnarkyLabel {
  readonly key: string;
  readonly displayText: string;
  readonly description: string;
  readonly tone: LabelTone;
}

export const SNARKY_LABELS: Readonly<Record<string, SnarkyLabel>> = Object.freeze({
  POINT_MACHINE: {
    key: 'POINT_MACHINE',
    displayText: 'Point Machine',
    description: 'Franchise with the most points scored in the season (Most PF)',
    tone: 'positive',
  },
  IRON_CURTAIN: {
    key: 'IRON_CURTAIN',
    displayText: 'Iron Curtain',
    description: 'Franchise that allowed the fewest points against in the season (Least PA)',
    tone: 'positive',
  },
  ALPHA_DOG: {
    key: 'ALPHA_DOG',
    displayText: 'Alpha Dog',
    description: 'Franchise with the best win-loss record in the season',
    tone: 'positive',
  },
  LEAGUE_DOORMAT: {
    key: 'LEAGUE_DOORMAT',
    displayText: 'League Doormat',
    description: 'Franchise with the worst win-loss record in the season',
    tone: 'sting',
  },
  GLASS_CANNON: {
    key: 'GLASS_CANNON',
    displayText: 'Glass Cannon',
    description: 'Franchise with high points scored but a poor win total (high PF, low wins)',
    tone: 'sting',
  },
  PAPER_TIGER: {
    key: 'PAPER_TIGER',
    displayText: 'Paper Tiger',
    description: 'Franchise that allowed the most points against in the season (high PA)',
    tone: 'sting',
  },
  // DRAFT_DAY_GENIUS and WASTED_PICKS are intentionally unwired: draft ROI
  // needs a pick-value baseline (e.g. positional ADP or expected-value curve)
  // that is not stored anywhere in the schema today. Leave them defined here,
  // do not compute or render them, until a draft-value model exists.
  DRAFT_DAY_GENIUS: {
    key: 'DRAFT_DAY_GENIUS',
    displayText: 'Draft Day Genius',
    description: 'Franchise with the best draft return on investment',
    tone: 'positive',
  },
  WASTED_PICKS: {
    key: 'WASTED_PICKS',
    displayText: 'Wasted Picks',
    description: 'Franchise with the worst draft return on investment',
    tone: 'sting',
  },
  ON_FIRE: {
    key: 'ON_FIRE',
    displayText: 'On Fire',
    description: 'Franchise with the longest win streak',
    tone: 'positive',
  },
  ROCK_BOTTOM: {
    key: 'ROCK_BOTTOM',
    displayText: 'Rock Bottom',
    description: 'Franchise with the longest losing streak',
    tone: 'sting',
  },
  MERCY_RULE: {
    key: 'MERCY_RULE',
    displayText: 'Mercy Rule',
    description: 'Franchise that won by the biggest margin in a single matchup (biggest blowout win)',
    tone: 'positive',
  },
  CARDIAC_CREW: {
    key: 'CARDIAC_CREW',
    displayText: 'Cardiac Crew',
    description: 'Franchise that won by the smallest margin in a single matchup (closest win)',
    tone: 'neutral',
  },
  WHAT_COULDVE_BEEN: {
    key: 'WHAT_COULDVE_BEEN',
    displayText: "What Could've Been",
    description: 'Franchise with the highest best-possible roster score vs actual lineup (best possible roster)',
    tone: 'neutral',
  },
  COACHING_MALPRACTICE: {
    key: 'COACHING_MALPRACTICE',
    displayText: 'Coaching Malpractice',
    description: 'Franchise with the largest gap between optimal lineup and actual lineup score (biggest underperformer)',
    tone: 'sting',
  },
  BLOWOUT_BAIT: {
    key: 'BLOWOUT_BAIT',
    displayText: 'Blowout Bait',
    description: 'Franchise with the worst average margin of defeat in the season (when they lose, they lose big)',
    tone: 'sting',
  },
} as const);

// ===========================================================================
// Hub editorial content (preseason 1a + between-weeks 1d)
// ===========================================================================
// Site-voice ("the friend in the group chat with the receipts") copy for the
// two newsletter-replacement hub states. This is SEEDED content keyed to the
// real league: division names ("Division 1/2/3") and franchise slugs match the
// live DB so cards resolve to real crests. The COPY itself stays deliberately
// generic: no fabricated stats, no invented head-to-head records or player
// names, and no member speech put in a real team's mouth (the smack feed is
// authored by the site's own "Site Desk", not by franchises). Phase 2 swaps
// the source to an LLM-written cron table WITHOUT changing consumers, so every
// hub reads through getHubEditorial() and treats these values as opaque.
// Consumers resolve by real division name / franchise slug at render time and
// fall back gracefully when a key is unknown.

export type PredictionVerdict = 'LOCK' | 'NO' | 'UP' | 'DOWN';
export type ReceiptCategory = 'DRAFT' | 'TRADE' | 'WAIVERS' | 'FIRE_SALE' | 'AGING_CORE';

/** One-liner character + rivalry note for a division, keyed by division name. */
export interface DivisionEditorial {
  readonly divisionName: string;
  readonly characterization: string;
  readonly rivalryNote: string;
}

/** A "Bold Predictions · Site Desk" card. */
export interface BoldPrediction {
  readonly kicker: string;
  readonly verdict: PredictionVerdict;
  readonly body: string;
}

/** An "Offseason Receipts" card, attributed to a franchise by slug. */
export interface OffseasonReceipt {
  readonly category: ReceiptCategory;
  readonly franchiseSlug: string;
  readonly body: string;
}

/** Trash angles for matchup previews: per-pair blurbs + a game-of-week blurb. */
export interface MatchupTrashAngles {
  /** Keyed by matchupPairKey(slugA, slugB); order-independent. */
  readonly byPair: Readonly<Record<string, string>>;
  readonly gameOfWeekBlurb: string;
}

/** A smack-feed card (authored by the Site Desk). Mirrors the eventual DB row shape. */
export interface SmackPost {
  readonly franchiseName: string;
  readonly franchiseSlug: string;
  readonly abbreviation: string;
  readonly brandingColor: string;
  readonly body: string;
  /** ISO 8601; computed relative to now so the seed never looks stale. */
  readonly postedAt: string;
}

export interface HubEditorial {
  /** Keyed by division name. Use divisionFallback for unknown names. */
  readonly divisions: Readonly<Record<string, DivisionEditorial>>;
  readonly divisionFallback: DivisionEditorial;
  readonly burningQuestions: readonly string[];
  readonly boldPredictions: readonly BoldPrediction[];
  readonly offseasonReceipts: readonly OffseasonReceipt[];
  readonly matchupAngles: MatchupTrashAngles;
  readonly smackPosts: readonly SmackPost[];
  /**
   * Optional hero deck (the sub-headline under the hub title). Null when no DB
   * content overrides it; consumers that compute their own dek can ignore it.
   * Populated by the generate-content cron; forward-compatible, so adding it
   * does not change what existing consumers render.
   */
  readonly heroDek: string | null;
}

/**
 * Order-independent key for a matchup pair, so a byPair lookup works regardless
 * of which team is "home". Lowercased and sorted.
 */
export function matchupPairKey(slugA: string, slugB: string): string {
  return [slugA.toLowerCase(), slugB.toLowerCase()].sort().join('__');
}

// Keyed by real division name. Copy is generic-but-usable site voice; no
// fabricated records or standings (those come from live data on the cards).
const DIVISION_EDITORIAL: Readonly<Record<string, DivisionEditorial>> = Object.freeze({
  'Division 1': {
    divisionName: 'Division 1',
    characterization: 'nobody blinks',
    rivalryNote:
      'The kind of bracket where everyone talks a big game in August. Someone has to back it up.',
  },
  'Division 2': {
    divisionName: 'Division 2',
    characterization: 'wide open',
    rivalryNote:
      'No clear favorite, no easy weeks. Every matchup here reads like a coin flip until it is not.',
  },
  'Division 3': {
    divisionName: 'Division 3',
    characterization: 'knife fight',
    rivalryNote:
      'Tight top to bottom. The standings shuffle every Sunday and nobody feels safe.',
  },
});

const DIVISION_FALLBACK: DivisionEditorial = Object.freeze({
  divisionName: 'Division',
  characterization: 'wide open',
  rivalryNote: 'Nobody has claimed this division yet. Someone will. Probably loudly.',
});

const BURNING_QUESTIONS: readonly string[] = Object.freeze([
  'Was last year\'s champion the real thing, or the start of a very long hangover?',
  'Can anyone in the field slow down the division favorite\'s offense?',
  'Is this finally the year the perennial doormat wins more than four?',
]);

const BOLD_PREDICTIONS: readonly BoldPrediction[] = Object.freeze([
  {
    kicker: 'Title Repeat',
    verdict: 'NO',
    body:
      'The defending champ misses the final. Champions\' hangovers are real, and that roster is one hamstring from ordinary.',
  },
  {
    kicker: 'Division Winner',
    verdict: 'LOCK',
    body:
      'The favorite takes its division wire to wire. The rest of that bracket is auditioning for second and they know it.',
  },
  {
    kicker: 'Biggest Riser',
    verdict: 'UP',
    body:
      'Two first-round picks on one position is either genius or a rebuild in disguise. We say genius, and we say playoffs.',
  },
  {
    kicker: 'League Doormat',
    verdict: 'DOWN',
    body:
      'Same team, same story. A quiet offseason and a draft that added exactly zero help. The floor is still the floor.',
  },
]);

// Real franchise slugs; bodies are generic category teasers (no fabricated
// specific trades, picks, or players) so nothing here claims something that did
// not happen. Phase 2 replaces these with real, data-backed receipts.
const OFFSEASON_RECEIPTS: readonly OffseasonReceipt[] = Object.freeze([
  {
    category: 'DRAFT',
    franchiseSlug: 'better-call-hall',
    body:
      'Drafted like the mock never ended: reaches, sleepers, and one pick the whole room questioned. September will settle it.',
  },
  {
    category: 'TRADE',
    franchiseSlug: 'foopus',
    body:
      'Rewired half the roster before Labor Day. All-in energy from a team that swears this is finally the year.',
  },
  {
    category: 'WAIVERS',
    franchiseSlug: 'olave-garden',
    body:
      'Torched the FAAB budget early chasing upside. Bold strategy, assuming any of it actually hits.',
  },
  {
    category: 'FIRE_SALE',
    franchiseSlug: 'mccarthyism',
    body:
      'Cashed in the veterans for picks and called it a plan. The rebuild timeline remains a closely guarded secret.',
  },
]);

// Hand-written editorial spotlights that survive the generated-content
// overlay: appended after generated receipts rather than replaced by them.
// Grounded in real 2026 roster data at time of writing: the Watson Love Diggs
// headliners are Beckham (33), Hopkins (33), Diggs (32), Conner (31),
// Chubb (30), and Deebo (30).
const PINNED_OFFSEASON_RECEIPTS: readonly OffseasonReceipt[] = Object.freeze([
  {
    category: 'AGING_CORE',
    franchiseSlug: 'watson-love-diggs',
    body:
      'Beckham, Hopkins, and Diggs headline what would have been the scariest roster of 2019. This is a dynasty league; someone should tell the dynasty.',
  },
]);

// No seeded per-pair blurbs: a pair-specific angle would fabricate a rivalry
// narrative for real teams. byPair is intentionally empty so the between-weeks
// slate falls back to genericSlateAngle (a truthful records-based line) for
// every matchup; Phase 2 fills byPair from real head-to-head data. The
// game-of-the-week blurb stays generic (no team names, no invented stats).
const MATCHUP_ANGLES: MatchupTrashAngles = Object.freeze({
  byPair: Object.freeze({}),
  gameOfWeekBlurb:
    'First place on the line and a week that actually matters. Two teams, one slate, and receipts to settle by Thursday night.',
});

// The smack feed is authored by the site's own "Site Desk", NOT by member
// franchises: we do not put fabricated quotes in a real team's mouth. Every
// post shares the Site Desk identity (a neutral gold crest) and speaks as the
// league's snarky editorial voice about the field at large, with no invented
// stats or head-to-head claims. Posts carry an age in hours rather than a
// frozen timestamp, so getHubEditorial() stamps a fresh postedAt each call and
// the "2d / 5h / 40m" labels never drift stale. Phase 2 can layer in genuine
// member-submitted posts alongside these.
const SITE_DESK = Object.freeze({
  franchiseName: 'Site Desk',
  franchiseSlug: 'site-desk',
  abbreviation: 'HQ',
  brandingColor: '#E2B858',
});

const SMACK_SEED: readonly (Omit<SmackPost, 'postedAt'> & { readonly hoursAgo: number })[] =
  Object.freeze([
    {
      ...SITE_DESK,
      body: 'Twelve teams, one trophy, and at least three of you drafting like the waiver wire closed for good.',
      hoursAgo: 48,
    },
    {
      ...SITE_DESK,
      body: 'Preseason optimism is a hell of a drug. Somebody in this field is headed for a long autumn and does not know it yet.',
      hoursAgo: 24,
    },
    {
      ...SITE_DESK,
      body: 'The group chat has been very quiet since the draft. We are choosing to read that as guilt.',
      hoursAgo: 22,
    },
    {
      ...SITE_DESK,
      body: 'Everybody is 0-0 today. Screenshot it. For most of you this is as good as the record gets.',
      hoursAgo: 5,
    },
    {
      ...SITE_DESK,
      body: 'Defending a title is the hard part. History says the champ hears about it every single week.',
      hoursAgo: 1,
    },
  ]);

function buildSmackPosts(now: number): readonly SmackPost[] {
  return SMACK_SEED.map(({ hoursAgo, ...post }) => ({
    ...post,
    postedAt: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
  }));
}

/** The seeded editorial defaults, stamped for `now`. Always the fallback. */
function seededEditorial(now: number): HubEditorial {
  return {
    divisions: DIVISION_EDITORIAL,
    divisionFallback: DIVISION_FALLBACK,
    burningQuestions: BURNING_QUESTIONS,
    boldPredictions: BOLD_PREDICTIONS,
    offseasonReceipts: [...OFFSEASON_RECEIPTS, ...PINNED_OFFSEASON_RECEIPTS],
    matchupAngles: MATCHUP_ANGLES,
    smackPosts: buildSmackPosts(now),
    heroDek: null,
  };
}

const VALID_VERDICTS: readonly PredictionVerdict[] = ["LOCK", "NO", "UP", "DOWN"];
const VALID_CATEGORIES: readonly ReceiptCategory[] = [
  "DRAFT",
  "TRADE",
  "WAIVERS",
  "FIRE_SALE",
  "AGING_CORE",
];

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * Overlays published hub_content (already grouped by kind) onto the seeded
 * defaults, per field. For each kind: if the DB has rows, they win and replace
 * that field; kinds with no rows keep the seed. Malformed rows (missing body,
 * unknown verdict/category) are skipped rather than rendered. Pure and
 * synchronous so the overlay contract can be unit-tested without a database.
 */
export function overlayHubEditorial(
  seeds: HubEditorial,
  grouped: GroupedHubContent,
): HubEditorial {
  const result: {
    -readonly [K in keyof HubEditorial]: HubEditorial[K];
  } = { ...seeds };

  // division_note -> divisions (merged onto seed map by division name).
  const divisionRows = grouped.division_note ?? [];
  if (divisionRows.length > 0) {
    const divisions: Record<string, DivisionEditorial> = { ...seeds.divisions };
    for (const row of divisionRows) {
      const name = str(row.refKey);
      const rivalryNote = str(row.body);
      if (!name || !rivalryNote) continue;
      const characterization =
        str(row.extras?.characterization) ??
        seeds.divisions[name]?.characterization ??
        seeds.divisionFallback.characterization;
      divisions[name] = { divisionName: name, characterization, rivalryNote };
    }
    result.divisions = divisions;
  }

  // burning_question -> burningQuestions (full replace).
  const questionRows = grouped.burning_question ?? [];
  if (questionRows.length > 0) {
    const questions = questionRows.map((r) => str(r.body)).filter((q): q is string => q != null);
    if (questions.length > 0) result.burningQuestions = questions;
  }

  // bold_prediction -> boldPredictions (full replace).
  const predictionRows = grouped.bold_prediction ?? [];
  if (predictionRows.length > 0) {
    const predictions: BoldPrediction[] = [];
    for (const row of predictionRows) {
      const body = str(row.body);
      const kicker = str(row.extras?.kicker);
      const verdictRaw = str(row.extras?.verdict);
      const verdict = VALID_VERDICTS.includes(verdictRaw as PredictionVerdict)
        ? (verdictRaw as PredictionVerdict)
        : null;
      if (body && kicker && verdict) predictions.push({ kicker, verdict, body });
    }
    if (predictions.length > 0) result.boldPredictions = predictions;
  }

  // offseason_receipt -> offseasonReceipts (replaces the rotating seeds, but
  // pinned editorial spotlights are always appended after the generated set).
  const receiptRows = grouped.offseason_receipt ?? [];
  if (receiptRows.length > 0) {
    const receipts: OffseasonReceipt[] = [];
    for (const row of receiptRows) {
      const body = str(row.body);
      const franchiseSlug = str(row.refKey);
      const categoryRaw = str(row.extras?.category);
      const category = VALID_CATEGORIES.includes(categoryRaw as ReceiptCategory)
        ? (categoryRaw as ReceiptCategory)
        : null;
      if (body && franchiseSlug && category)
        receipts.push({ category, franchiseSlug, body });
    }
    if (receipts.length > 0)
      result.offseasonReceipts = [...receipts, ...PINNED_OFFSEASON_RECEIPTS];
  }

  // matchup_angle / game_of_week_blurb -> matchupAngles (byPair merged, blurb replaced).
  const angleRows = grouped.matchup_angle ?? [];
  const gotwRows = grouped.game_of_week_blurb ?? [];
  if (angleRows.length > 0 || gotwRows.length > 0) {
    const byPair: Record<string, string> = { ...seeds.matchupAngles.byPair };
    for (const row of angleRows) {
      const key = str(row.refKey);
      const angle = str(row.body);
      if (key && angle) byPair[key] = angle;
    }
    const gotwBlurb = str(gotwRows[0]?.body) ?? seeds.matchupAngles.gameOfWeekBlurb;
    result.matchupAngles = { byPair, gameOfWeekBlurb: gotwBlurb };
  }

  // smack_post -> smackPosts (full replace; Site Desk voice, timestamped from created_at).
  const smackRows = grouped.smack_post ?? [];
  if (smackRows.length > 0) {
    const posts: SmackPost[] = [];
    for (const row of smackRows) {
      const body = str(row.body);
      if (!body) continue;
      posts.push({
        ...SITE_DESK,
        body,
        postedAt: (row.createdAt ?? new Date()).toISOString(),
      });
    }
    if (posts.length > 0) result.smackPosts = posts;
  }

  // hero_dek -> heroDek (first row).
  const heroDek = str((grouped.hero_dek ?? [])[0]?.body);
  if (heroDek) result.heroDek = heroDek;

  return result;
}

export interface HubEditorialOptions {
  /** When set, published hub_content for this season overlays the seeds. */
  seasonId?: number;
  /** Week scope: a number for regular-season content, null/undefined for season-scoped. */
  week?: number | null;
  /** Injectable clock for the relative smack-post timestamps. */
  now?: number;
}

/**
 * Single accessor for all hub editorial content. Consumers NEVER import the
 * underlying constants; they read through this so the source can be repointed
 * (LLM cron / DB table) transparently. When `seasonId` is given, published
 * hub_content is overlaid onto the seeded defaults per kind (DB wins per kind;
 * kinds with no rows fall back to seeds; any DB error returns pure seeds). When
 * `seasonId` is omitted, the seeded defaults are returned unchanged, so a hub
 * with no DB content renders exactly as before. Smack-post timestamps are
 * stamped relative to `now`.
 */
export async function getHubEditorial(
  opts: HubEditorialOptions = {},
): Promise<HubEditorial> {
  const now = opts.now ?? Date.now();
  const seeds = seededEditorial(now);

  if (opts.seasonId == null) return seeds;

  try {
    const grouped = await getPublishedHubContent(
      opts.seasonId,
      opts.week ?? null,
    );
    return overlayHubEditorial(seeds, grouped);
  } catch (e) {
    console.error("[content] getHubEditorial overlay failed; using seeds:", e);
    return seeds;
  }
}
