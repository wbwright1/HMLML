import type { HubContentKind } from "@/lib/queries/hub-content";
import type { StatsContext } from "@/lib/content-gen/stats-context";
import {
  normalize,
  phraseSetsOverlap,
  signaturePhrasesIn,
} from "@/lib/content-gen/phrases";

// The canonical copy normalizer lives in phrases.ts (the leaf module); it is
// re-exported here under its historical name for existing callers.
export { normalize };

// ---------------------------------------------------------------------------
// Content diversity layer
// ---------------------------------------------------------------------------
// Two hub modules (e.g. burning_question and offseason_receipt) can each
// independently land on the same franchise + the same number ("Foopus", "12
// points") and read as an obvious echo when they sit on the same page. This
// module gives generation a way to over-produce candidates per kind and then
// pick a diverse, non-repeating subset: same franchise + overlapping number,
// or the same central player, kills a row outright (the PRIMARY signal);
// trigram Jaccard similarity on the full body text is a SECONDARY, fuzzier
// signal for near-identical phrasing that doesn't share an obvious anchor.
// Pure, deterministic, no randomness: same input always yields same output.

export interface CandidateRow {
  kind: HubContentKind;
  refKey: string | null;
  body: string;
  extras: Record<string, unknown> | null;
}

export interface Anchors {
  franchiseKey: string | null;
  numbers: number[];
  playerNames: string[];
  /** Stock idioms this body leans on; see lib/content-gen/phrases.ts. */
  phrases: Set<string>;
  trigrams: Set<string>;
}

// ---------------------------------------------------------------------------
// Text similarity primitives
// ---------------------------------------------------------------------------

/** Character trigrams of the normalized string, padded so short strings still produce grams. */
export function trigramSet(s: string): Set<string> {
  const norm = normalize(s);
  const padded = `  ${norm}  `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Jaccard similarity between two trigram sets: |A ∩ B| / |A ∪ B|. Empty/empty = 0 (no signal). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Anchor extraction
// ---------------------------------------------------------------------------

/**
 * A body reduced to its identity for exact-duplicate detection: case folded,
 * whitespace collapsed. Deliberately NOT a similarity measure; two rows that
 * merely rhyme are a different problem, handled by the trigram gate.
 */
function normalizedBody(body: string): string {
  return body.trim().toLowerCase().replace(/\s+/g, " ");
}

function extractNumbers(body: string): number[] {
  const matches = body.match(/\d+(?:\.\d+)?/g) ?? [];
  return matches.map((m) => parseFloat(m));
}

function franchiseNamesAndSlugs(ctx: StatsContext): { name: string; slug: string }[] {
  const seen = new Map<string, { name: string; slug: string }>();
  for (const t of ctx.leagueStandings) seen.set(t.slug, { name: t.name, slug: t.slug });
  return [...seen.values()];
}

function knownPlayerNames(ctx: StatsContext): string[] {
  const names = new Set<string>();
  for (const p of ctx.rosterProjections) {
    if (p.topProjectedPlayer) names.add(p.topProjectedPlayer.name);
  }
  for (const m of ctx.offseasonMoves ?? []) {
    for (const dp of m.draftedPlayers) names.add(dp.playerName);
    for (const tr of m.trades) {
      for (const n of tr.acquired.players) names.add(n);
      for (const n of tr.surrendered.players) names.add(n);
    }
  }
  if (ctx.weekInBooks?.playerOfWeek) names.add(ctx.weekInBooks.playerOfWeek.name);
  if (ctx.weekInBooks?.dudStarter) names.add(ctx.weekInBooks.dudStarter.name);
  return [...names];
}

/**
 * The dominant franchise this row is "about", used to cap how many rows
 * across a run may hang off the same franchise. Prefers refKey (a franchise
 * slug for offseason_receipt, a division name for division_note, a pairKey
 * for matchup_angle), falling back to scanning the body for a known
 * franchise name.
 */
function deriveFranchiseKey(row: CandidateRow, ctx: StatsContext): string | null {
  const slugs = new Set(ctx.leagueStandings.map((t) => t.slug));
  if (row.refKey) {
    if (slugs.has(row.refKey)) return row.refKey;
    if (row.refKey.includes("__")) return row.refKey; // matchup pairKey: already a unique two-franchise key
    // division_note refKey is a division name, not a franchise: fall through to body scan.
  }
  for (const { name, slug } of franchiseNamesAndSlugs(ctx)) {
    if (name && row.body.includes(name)) return slug;
  }
  return null;
}

function derivePlayerNames(row: CandidateRow, ctx: StatsContext): string[] {
  const known = knownPlayerNames(ctx);
  return known.filter((n) => n && row.body.includes(n));
}

/** Extracts the dedup-relevant anchors from a candidate row for the given context. */
export function extractAnchors(row: CandidateRow, ctx: StatsContext): Anchors {
  return {
    franchiseKey: deriveFranchiseKey(row, ctx),
    numbers: extractNumbers(row.body),
    playerNames: derivePlayerNames(row, ctx),
    phrases: signaturePhrasesIn(row.body),
    trigrams: trigramSet(row.body),
  };
}

/**
 * The PRIMARY duplicate signal, on its own: two rows share a hook when they
 * are about the same franchise AND cite an overlapping central number, when
 * they name the same central player, or when they lean on the same signature
 * phrase (a stock idiom two independent generators can both reach for; see
 * lib/content-gen/phrases.ts). The phrase signal is deliberately PRIMARY
 * rather than part of the fuzzy trigram tier: it is global and cross-kind,
 * which is exactly the scope "no two visible lines share a phrase" needs, and
 * it costs nothing on the far more common case of a body with no stock idiom
 * in it at all. Exported so callers outside
 * selectDiverseSubset (e.g. the template top-up in generate.ts) can apply the
 * exact same rule when merging rows into an already-selected set.
 */
export function sharesPrimaryHook(a: Anchors, b: Anchors): boolean {
  if (
    a.franchiseKey &&
    b.franchiseKey === a.franchiseKey &&
    a.numbers.some((n) => b.numbers.includes(n))
  ) {
    return true;
  }
  if (a.playerNames.length > 0 && a.playerNames.some((p) => b.playerNames.includes(p))) {
    return true;
  }
  if (phraseSetsOverlap(a.phrases, b.phrases)) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Diverse subset selection
// ---------------------------------------------------------------------------

export interface SelectOptions {
  /** Trigram Jaccard at/above this is treated as a near-duplicate (secondary signal). */
  similarityThreshold?: number;
  /** Max rows in the kept set that may share the same franchiseKey. */
  maxPerFranchise?: number;
  /** Max rows in the kept set that may cite the same central player. */
  maxPerPlayer?: number;
  /** Desired row count per kind; a kind not listed keeps every non-duplicate candidate. */
  targetCountsByKind?: Partial<Record<HubContentKind, number>>;
  /** Kind processing order (also the round-robin column order). Defaults to candidatesByKind's own key order. */
  kindPriority?: HubContentKind[];
  /** Kinds where at most ONE row per franchise may ever be kept, overriding maxPerFranchise. */
  franchiseUniqueKinds?: Set<HubContentKind>;
  /**
   * Kinds that bypass the caps and the duplicate gate entirely (see the
   * keepAllKinds comment inside selectDiverseSubset for why matchup_angle and
   * trade_verdict need this). Pass it EXPLICITLY: when omitted, the legacy
   * derived behavior applies ("target >= candidate count"), which silently
   * sweeps in any single-candidate kind and lets it skip the gate. That
   * fallback exists so no caller has to change, not because it is correct.
   * franchiseUniqueKinds always wins over this set.
   */
  keepAllKinds?: Set<HubContentKind>;
  /**
   * Kinds where a signature-phrase echo is worse than an empty slot, so a row
   * dropped for one is NEVER re-admitted by the coverage-first relaxation
   * pass. Without this the write-time phrase gate is a no-op for any kind
   * shipping a single candidate (the LLM path's one hero_dek): the row is
   * dropped and immediately handed back. Defaults to PHRASE_STRICT_KINDS.
   * Only put a kind here when something downstream can still fill the hole:
   * hero_dek qualifies because fillMissingKinds backfills it from the
   * template pool and the hub renders HERO_DEK_FALLBACK if even that fails.
   */
  phraseStrictKinds?: Set<HubContentKind>;
}

/** Kinds where every row must come from a distinct franchise (e.g. offseason receipts). */
export const FRANCHISE_UNIQUE_KINDS: Set<HubContentKind> = new Set(["offseason_receipt"]);

/**
 * The one kind where shipping an echo is worse than shipping nothing: the
 * hero dek sits directly above the Game of the Week card, and every layer
 * below this one can still fill an empty hero_dek (fillMissingKinds from the
 * template pool, then HERO_DEK_FALLBACK at render).
 */
export const PHRASE_STRICT_KINDS: Set<HubContentKind> = new Set(["hero_dek"]);

export interface DroppedRow {
  row: CandidateRow;
  /**
   * "phrase-echo" is a duplicate too, split out because the relaxation pass
   * treats it differently: those rows are re-admitted last, and never at all
   * for a phraseStrictKinds kind.
   */
  reason: "duplicate" | "phrase-echo" | "franchise-cap" | "player-cap";
}

export interface SelectResult {
  kept: CandidateRow[];
  dropped: DroppedRow[];
  /** Kinds that could not reach their target without relaxing caps/dup checks. */
  relaxedKinds: HubContentKind[];
}

/**
 * Greedily selects a diverse subset of candidate rows, per kind, coverage
 * first: every kind tries to reach its target count; if it can't without
 * duplicating a hook, the target is relaxed (best-available candidates are
 * accepted anyway) rather than shipping an empty module. Round-robins across
 * kinds (index 0 of every kind's list before index 1 of any) so no single
 * kind's candidates monopolize the shared franchise/player caps. Stable and
 * deterministic: candidate order in, order preserved; no randomness.
 */
export function selectDiverseSubset(
  candidatesByKind: Partial<Record<HubContentKind, CandidateRow[]>>,
  ctx: StatsContext,
  opts: SelectOptions = {},
): SelectResult {
  const similarityThreshold = opts.similarityThreshold ?? 0.5;
  const maxPerFranchise = opts.maxPerFranchise ?? 2;
  const maxPerPlayer = opts.maxPerPlayer ?? 1;
  const targetCounts = opts.targetCountsByKind ?? {};
  const franchiseUniqueKinds = opts.franchiseUniqueKinds ?? new Set<HubContentKind>();
  const phraseStrictKinds = opts.phraseStrictKinds ?? PHRASE_STRICT_KINDS;
  const kinds: HubContentKind[] =
    opts.kindPriority ?? (Object.keys(candidatesByKind) as HubContentKind[]);

  const kept: CandidateRow[] = [];
  const keptSet = new Set<CandidateRow>();
  const keptAnchors: Anchors[] = [];
  const dropped: DroppedRow[] = [];
  const droppedSet = new Set<CandidateRow>();
  /** Rows the strict pass rejected specifically for a signature-phrase echo. */
  const phraseEchoed = new Set<CandidateRow>();
  const franchiseCounts = new Map<string, number>();
  const playerCounts = new Map<string, number>();
  const relaxedKinds: HubContentKind[] = [];

  /**
   * null when the row is not a duplicate of anything kept. Otherwise the
   * reason, with "phrase-echo" reported whenever the collision is (also) a
   * shared signature phrase, since that is the reason the relaxation pass
   * treats specially.
   */
  function duplicateReason(anchors: Anchors): "duplicate" | "phrase-echo" | null {
    let hit: "duplicate" | null = null;
    for (const k of keptAnchors) {
      if (phraseSetsOverlap(anchors.phrases, k.phrases)) return "phrase-echo";
      if (sharesPrimaryHook(anchors, k)) hit = "duplicate";
      else if (jaccard(anchors.trigrams, k.trigrams) >= similarityThreshold) hit = "duplicate";
    }
    return hit;
  }

  // Franchise/player caps are scoped PER KIND (e.g. "at most 2 offseason
  // receipts about the same franchise"), not globally across the whole run:
  // a franchise being the subject of a burning_question AND a bold_prediction
  // AND an offseason_receipt in the same run is normal and desired, as long
  // as each mention has its own hook. Cross-kind repetition of the exact same
  // hook (same franchise + number, or same central player) is still caught
  // unconditionally by the primary duplicate check in isDuplicate above,
  // which IS global.
  // Exact bodies already kept, for the identity check the keep-all path and
  // the relaxation pass share. Case- and whitespace-insensitive, so trivial
  // reformatting of the same sentence still counts as the same sentence.
  const keptBodies = new Set<string>();

  function accept(row: CandidateRow, anchors: Anchors): void {
    kept.push(row);
    keptSet.add(row);
    keptBodies.add(normalizedBody(row.body));
    keptAnchors.push(anchors);
    if (anchors.franchiseKey) {
      const key = `${row.kind}::${anchors.franchiseKey}`;
      franchiseCounts.set(key, (franchiseCounts.get(key) ?? 0) + 1);
    }
    for (const p of anchors.playerNames) {
      const key = `${row.kind}::${p}`;
      playerCounts.set(key, (playerCounts.get(key) ?? 0) + 1);
    }
  }

  function tryAddStrict(row: CandidateRow): boolean {
    const anchors = extractAnchors(row, ctx);
    const cap = franchiseUniqueKinds.has(row.kind) ? 1 : maxPerFranchise;
    if (
      anchors.franchiseKey &&
      (franchiseCounts.get(`${row.kind}::${anchors.franchiseKey}`) ?? 0) >= cap
    ) {
      dropped.push({ row, reason: "franchise-cap" });
      droppedSet.add(row);
      return false;
    }
    if (
      anchors.playerNames.some(
        (p) => (playerCounts.get(`${row.kind}::${p}`) ?? 0) >= maxPerPlayer,
      )
    ) {
      dropped.push({ row, reason: "player-cap" });
      droppedSet.add(row);
      return false;
    }
    const dupReason = duplicateReason(anchors);
    if (dupReason) {
      dropped.push({ row, reason: dupReason });
      droppedSet.add(row);
      if (dupReason === "phrase-echo") phraseEchoed.add(row);
      return false;
    }
    accept(row, anchors);
    return true;
  }

  const targetFor = (kind: HubContentKind): number =>
    targetCounts[kind] ?? (candidatesByKind[kind] ?? []).length;

  // "Keep-all" kinds: the target already admits every candidate, so there is
  // no selection to make and the duplicate gate is pure noise. The canonical
  // case is matchup_angle: every current matchup MUST get its angle, and the
  // rows share a boilerplate skeleton ("X (record) hosts Y (record)...") that
  // trips the trigram threshold, producing spurious drop-then-relax cycles
  // that inflate droppedCount and list matchup_angle in relaxedKinds every
  // regular-season run. Each matchup already has a unique pairKey, so
  // cross-matchup dedup buys nothing; accept them outright. Anchors are still
  // recorded so OTHER kinds' candidates dedupe against these rows. Excludes
  // franchiseUniqueKinds: those kinds must ALWAYS enforce the one-per-franchise
  // cap, even when candidate count happens to equal the target.
  //
  // Callers SHOULD pass this explicitly. Derived from candidate counts, the
  // set also swallowed every kind that ships exactly one candidate for a
  // target of one (hero_dek, game_of_week_blurb), which is how the hub dek
  // and the Game of the Week blurb both shipped "receipts to settle" on the
  // same page: neither row ever reached the duplicate gate. Kind order does
  // the tie-breaking when a real collision is found: "regular" runs
  // matchup_angle, game_of_week_blurb, hero_dek, smack_post, so the GotW
  // blurb is admitted first and the dek is the row that must yield. That
  // ordering is now load-bearing, not incidental.
  const keepAllKinds = new Set(
    (opts.keepAllKinds
      ? [...opts.keepAllKinds]
      : kinds.filter((k) => targetFor(k) >= (candidatesByKind[k] ?? []).length)
    ).filter((k) => !franchiseUniqueKinds.has(k)),
  );

  const addedPerKind = new Map<HubContentKind, number>();
  const maxLen = Math.max(0, ...kinds.map((k) => (candidatesByKind[k] ?? []).length));

  // Round-robin pass: strict caps + dedup (keep-all kinds bypass both).
  for (let i = 0; i < maxLen; i++) {
    for (const kind of kinds) {
      const candidates = candidatesByKind[kind] ?? [];
      const row = candidates[i];
      if (!row) continue;
      if ((addedPerKind.get(kind) ?? 0) >= targetFor(kind)) continue;
      if (keepAllKinds.has(kind)) {
        // Keep-all bypasses the SIMILARITY gate (the trigram threshold that
        // boilerplate skeletons trip), but never the identity one: two rows
        // with the exact same body are not two angles, they are one angle
        // printed twice, and shipping both puts visibly identical copy on two
        // cards. The dropped row leaves its kind short, so topUpShortKinds
        // refills that pairKey from the deterministic builder instead.
        const bodyKey = normalizedBody(row.body);
        if (keptBodies.has(bodyKey)) {
          dropped.push({ row, reason: "duplicate" });
          droppedSet.add(row);
          continue;
        }
        accept(row, extractAnchors(row, ctx));
        addedPerKind.set(kind, (addedPerKind.get(kind) ?? 0) + 1);
        continue;
      }
      if (tryAddStrict(row)) {
        addedPerKind.set(kind, (addedPerKind.get(kind) ?? 0) + 1);
      }
    }
  }

  // Coverage-first relaxation: any kind still under target accepts its best
  // remaining (not-yet-kept) candidates outright, ignoring caps/dup checks.
  // An empty module is worse than a mild echo. A character-identical body is
  // not a mild echo though, so that one gate survives relaxation: refilling
  // the slot with the exact line already on the page buys nothing, and
  // leaving the kind short hands the slot to topUpShortKinds' deterministic
  // template instead.
  //
  // Signature-phrase echoes are the other exception, and they run in TWO
  // sub-passes rather than one: every candidate that is not an echo gets
  // considered first, and only if the kind is still short do the echoes come
  // back. That way a phrase-clean sibling always beats an echo, without
  // costing a single row of coverage. For a phraseStrictKinds kind the second
  // sub-pass never runs at all: a lone hero_dek that echoed the Game of the
  // Week card is dropped for good, because handing it straight back would
  // make the whole write-time gate a no-op on the LLM path (one candidate,
  // target one). The hole is filled downstream by fillMissingKinds from the
  // template pool, and by HERO_DEK_FALLBACK at render if even that collides.
  for (const kind of kinds) {
    const target = targetFor(kind);
    let added = addedPerKind.get(kind) ?? 0;
    if (added >= target) continue;
    let pushedRelaxedKind = false;
    const allowEchoPasses = phraseStrictKinds.has(kind) ? [false] : [false, true];
    for (const allowEchoes of allowEchoPasses) {
      for (const row of candidatesByKind[kind] ?? []) {
        if (added >= target) break;
        if (keptSet.has(row)) continue;
        if (keptBodies.has(normalizedBody(row.body))) continue;
        if (!allowEchoes && phraseEchoed.has(row)) continue;
        const anchors = extractAnchors(row, ctx);
        if (
          franchiseUniqueKinds.has(row.kind) &&
          anchors.franchiseKey &&
          (franchiseCounts.get(`${row.kind}::${anchors.franchiseKey}`) ?? 0) >= 1
        ) {
          continue;
        }
        if (droppedSet.has(row)) {
          const idx = dropped.findIndex((d) => d.row === row);
          if (idx >= 0) dropped.splice(idx, 1);
          droppedSet.delete(row);
        }
        accept(row, anchors);
        added++;
        if (!pushedRelaxedKind) {
          relaxedKinds.push(kind);
          pushedRelaxedKind = true;
        }
      }
      if (added >= target) break;
    }
    addedPerKind.set(kind, added);
  }

  return { kept, dropped, relaxedKinds };
}
