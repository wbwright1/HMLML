import type { HubContentKind } from "@/lib/queries/hub-content";
import type { StatsContext } from "@/lib/content-gen/stats-context";

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
  trigrams: Set<string>;
}

// ---------------------------------------------------------------------------
// Text similarity primitives
// ---------------------------------------------------------------------------

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
    trigrams: trigramSet(row.body),
  };
}

/**
 * The PRIMARY duplicate signal, on its own: two rows share a hook when they
 * are about the same franchise AND cite an overlapping central number, or
 * when they name the same central player. Exported so callers outside
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
}

/** Kinds where every row must come from a distinct franchise (e.g. offseason receipts). */
export const FRANCHISE_UNIQUE_KINDS: Set<HubContentKind> = new Set(["offseason_receipt"]);

export interface DroppedRow {
  row: CandidateRow;
  reason: "duplicate" | "franchise-cap" | "player-cap";
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
  const kinds: HubContentKind[] =
    opts.kindPriority ?? (Object.keys(candidatesByKind) as HubContentKind[]);

  const kept: CandidateRow[] = [];
  const keptSet = new Set<CandidateRow>();
  const keptAnchors: Anchors[] = [];
  const dropped: DroppedRow[] = [];
  const droppedSet = new Set<CandidateRow>();
  const franchiseCounts = new Map<string, number>();
  const playerCounts = new Map<string, number>();
  const relaxedKinds: HubContentKind[] = [];

  function isDuplicate(anchors: Anchors): boolean {
    for (const k of keptAnchors) {
      if (sharesPrimaryHook(anchors, k)) return true;
      if (jaccard(anchors.trigrams, k.trigrams) >= similarityThreshold) return true;
    }
    return false;
  }

  // Franchise/player caps are scoped PER KIND (e.g. "at most 2 offseason
  // receipts about the same franchise"), not globally across the whole run:
  // a franchise being the subject of a burning_question AND a bold_prediction
  // AND an offseason_receipt in the same run is normal and desired, as long
  // as each mention has its own hook. Cross-kind repetition of the exact same
  // hook (same franchise + number, or same central player) is still caught
  // unconditionally by the primary duplicate check in isDuplicate above,
  // which IS global.
  function accept(row: CandidateRow, anchors: Anchors): void {
    kept.push(row);
    keptSet.add(row);
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
    if (isDuplicate(anchors)) {
      dropped.push({ row, reason: "duplicate" });
      droppedSet.add(row);
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
  const keepAllKinds = new Set(
    kinds.filter(
      (k) => targetFor(k) >= (candidatesByKind[k] ?? []).length && !franchiseUniqueKinds.has(k),
    ),
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
  // An empty module is worse than a mild echo.
  for (const kind of kinds) {
    const target = targetFor(kind);
    let added = addedPerKind.get(kind) ?? 0;
    if (added >= target) continue;
    let pushedRelaxedKind = false;
    for (const row of candidatesByKind[kind] ?? []) {
      if (added >= target) break;
      if (keptSet.has(row)) continue;
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
    addedPerKind.set(kind, added);
  }

  return { kept, dropped, relaxedKinds };
}
