// ---------------------------------------------------------------------------
// Signature phrases: the cross-surface echo signal
// ---------------------------------------------------------------------------
// The diversity layer in dedupe.ts catches two rows that share a franchise +
// number, a central player, or 50%+ of their trigrams. It does NOT catch two
// otherwise-unrelated sentences that both reach for the same stock idiom, and
// that is exactly what a reader notices first: "Week 1 is set ... a week of
// receipts to settle by Sunday" sitting directly above "First place is on the
// line and there are receipts to settle by Thursday night" reads as one
// fill-in-the-blank template, not two editorial voices.
//
// This module is that missing signal. Every entry is a normalized idiom of
// TWO OR MORE words: a single common word ("receipts", "line") would veto
// legitimate copy across the whole site. sharesPrimaryHook() in dedupe.ts
// treats a shared entry as a hard duplicate, which means the phrase list is a
// GLOBAL veto: a phrase that appears in exactly one place today does not
// belong on it. Add an entry only when two independent generators can both
// reach for it.
//
// ---------------------------------------------------------------------------
// GENERATED-COPY SWEEP (issue #274, Sep 2026)
// ---------------------------------------------------------------------------
// Every source of generated/seeded editorial copy on the site, whether it
// collided with another line that can render on the same page, and what was
// done about it. Future copy additions should check against this list.
//
// COLLIDED, FIXED:
//   * lib/content-gen/templates.ts regularHeroDek + gameOfWeek
//       Both used "receipts to settle" on the same hub render. The GotW blurb
//       is unchanged (owner's call: it is the better line); regularHeroDek is
//       now a 6-variant pool rotated deterministically by ctx.week, and the
//       phrase signal below stops any variant echoing the GotW blurb.
//   * lib/hub/between-weeks.ts stakesClause + the GotW blurb
//       The GotW card kicker read "First place on the line" directly above a
//       blurb reading "First place is on the line". The kicker now says
//       "Division lead at stake" / "Pride at stake".
//   * lib/content.ts MATCHUP_ANGLES.gameOfWeekBlurb + the hub dek fallback
//       The seed path (no hub_content rows in the DB) reproduced the same
//       collision: the seeded GotW blurb and the hardcoded dek fallback in
//       components/hub/between-weeks-hub.tsx both said "receipts to settle",
//       and both seeded blurbs also say "Two teams, one slate" (hence the
//       "one slate" entry below). The dek fallback was rewritten and hoisted
//       into HERO_DEK_FALLBACK in lib/content.ts (copy belongs in centralized
//       constants, not in JSX).
//   * lib/goat-content.ts GOAT_BLURBS.lucky_ring + GOAT_GENERIC_OVERFLOW
//       Both said "group chat", and both are reachable in one ladder render
//       on /records/hall-of-fame. The overflow line was rewritten, and
//       assignGoatBlurbs now rejects a candidate that shares a signature
//       phrase with one it already handed out.
//   * lib/content-gen/templates.ts offseasonReceipts
//       Three candidates in one pool all ended "The rebuild timeline remains
//       a closely guarded secret." Only one can now ship per run.
//
// ENFORCEMENT POINTS (all three go through phraseSetsOverlap below):
//   * WRITE TIME: sharesPrimaryHook in dedupe.ts, so no colliding row is
//     generated; hero_dek is in PHRASE_STRICT_KINDS, so its echoes are never
//     relaxed back in. fillMissingKinds in generate.ts screens the template
//     backfill against surviving LLM rows (it runs after the diversity
//     layer), and topUpShortKinds already screened with sharesPrimaryHook.
//   * RENDER TIME: components/hub/between-weeks-hub.tsx compares the STORED
//     dek against the Game of the Week blurb AND its kicker, because
//     hub_content rows outlive a generator fix.
//   * PER-PAGE POOLS: assignGoatBlurbs in lib/goat-content.ts.
//
// REVIEWED, NO SAME-PAGE COLLISION (left alone):
//   * lib/content-gen/templates.ts preseasonHeroDek / offseasonHeroDek /
//     preseasonSmack / offseasonSmack / regularSmack / divisionNotes /
//     burningQuestions / boldPredictions / tradeVerdicts / matchupAngles
//     (matchup angles come from the lib/hub/slate-angle.ts ladder, which is
//     derived per pair and shares no stock idiom with the hub deks)
//   * lib/content-gen/generate.ts LLM prompts (the LLM path runs through the
//     same dedupe layer, so it inherits this signal; the regular-season
//     hero_dek spec also now tells it not to reuse the GotW blurb's phrasing)
//   * lib/content.ts DIVISION_EDITORIAL / BURNING_QUESTIONS /
//     BOLD_PREDICTIONS / OFFSEASON_RECEIPTS / SMACK_SEED
//   * lib/hub/between-weeks.ts (other clause builders), lib/live-aside.ts,
//     lib/playoff-labels.ts, lib/awards.ts superlative labels
//   * lib/book/shared.ts + lib/book/futures.ts: deterministic per-market copy
//     on /book, no overlap with hub copy
//   * lib/queries/trade-grades.ts:591 ("receipts", /trades),
//     lib/queries/superlatives.ts:653 ("floor of a dumpster", /records):
//     cross-page repeats of hub vocabulary, never rendered on the same page
//   * lib/queries/week-history.ts, league-moves.ts, players-to-watch.ts: use
//     "receipts" as a type name and internal vocabulary, never as prose

/**
 * Stock idioms that more than one generator can independently reach for.
 * Normalized (lowercase, punctuation stripped) so matching is done against
 * normalize()d bodies. Two words minimum, always.
 */
export const SIGNATURE_PHRASES: readonly string[] = Object.freeze([
  "receipts to settle",
  "on the line",
  "at stake",
  "group chat",
  "talk is cheap",
  "public service announcement",
  "somebody check on",
  "actually matters",
  "bragging rights",
  "screenshot the",
  "taking notes",
  "story for a later season",
  "closely guarded secret",
  "headline the slate",
  "grudge match",
  "one slate",
]);

/**
 * Case-folded, punctuation-stripped, whitespace-collapsed. THE canonical copy
 * normalizer for the whole content layer: it lives in this module (the leaf of
 * the dependency graph) rather than in dedupe.ts, which imports it and
 * re-exports it under its historical name. One normalizer, no drift.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The signature phrases present in a body, normalized. Empty when there are none. */
export function signaturePhrasesIn(body: string): Set<string> {
  const norm = normalize(body);
  const found = new Set<string>();
  for (const phrase of SIGNATURE_PHRASES) {
    if (norm.includes(phrase)) found.add(phrase);
  }
  return found;
}

/**
 * THE overlap primitive. Every consumer (the write-time gate in dedupe.ts,
 * the render-time guard on the hub, the GOAT ladder's pick guard) goes
 * through this one function, so "do these two lean on the same idiom" has
 * exactly one implementation.
 */
export function phraseSetsOverlap(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const p of a) if (b.has(p)) return true;
  return false;
}

/** True when two bodies lean on the same stock idiom. */
export function sharesSignaturePhrase(a: string, b: string): boolean {
  return phraseSetsOverlap(signaturePhrasesIn(a), signaturePhrasesIn(b));
}

/**
 * True when `body` leans on any idiom already spent on this page/run.
 * The multi-line form of sharesSignaturePhrase, for a guard comparing one
 * candidate against several already-visible lines.
 */
export function sharesPhraseWithAny(
  body: string,
  others: readonly string[],
): boolean {
  const phrases = signaturePhrasesIn(body);
  if (phrases.size === 0) return false;
  return others.some((other) => phraseSetsOverlap(phrases, signaturePhrasesIn(other)));
}
