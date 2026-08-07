/**
 * Franchise abbreviations (2-3 chars, uppercase alphanumeric).
 *
 * Sleeper exposes no team-abbreviation field anywhere in this league's data
 * (verified against /league/{id}, /league/{id}/users and /league/{id}/rosters),
 * so the value cannot be synced. It is derived instead, and the rule is the
 * league's natural word-initial acronym: the same scheme `teamAcronym` already
 * renders on the draft board, tightened to fit the 2-3 character column.
 *
 * Fitting rule, in order:
 *   1. the plain word-initial acronym                  ("Watson Love Diggs" -> WLD)
 *   2. the acronym with conjunctions dropped           ("Of Mice and Mendoza" -> OMM)
 *   3. the acronym with articles dropped too
 *   4. the plain acronym truncated to 3                ("Latter Day Lamb Special" -> LDLS -> LDL)
 * Anything past that is collision handling, which no current franchise needs.
 *
 * The curated map is the escape hatch for a name the rule cannot render
 * naturally. It is keyed by franchise ID (the Sleeper user_id), never by name,
 * so an override survives renames and ownership changes per the Franchise
 * Identity rule.
 */

import { teamAcronym } from "@/lib/team-acronym";

/**
 * Curated overrides, keyed by franchise ID (Sleeper user_id).
 *
 * Empty by design: all 12 current franchises get their natural acronym from
 * the derivation rule (TTT, BCH, VV, OMM, MCC, FOO, PTP, WLD, BGS, BCM, LDL,
 * OG), so there is nothing to override. Add an entry here only when a future
 * name derives to something wrong, with a comment naming the franchise so a
 * later reader can tell which is which after a rename.
 */
export const CURATED_FRANCHISE_ABBREVIATIONS: Record<string, string> = {};

/** Valid shape for a stored abbreviation. */
export const ABBREVIATION_PATTERN = /^[A-Z0-9]{2,3}$/;

/**
 * Words dropped, in tiers, when the plain acronym is too long. Conjunctions go
 * first ("Of Mice and Mendoza" -> OMM keeps the "Of"); articles and short
 * prepositions only if it is still too long. A 3-word name never reaches this
 * code, which is why "Pay The Price" keeps its "The" and stays PTP.
 */
const DROPPABLE_TIERS: ReadonlySet<string>[] = [
  new Set(["AND", "&", "N", "OR", "PLUS", "VS"]),
  new Set(["THE", "A", "AN", "OF", "MY", "TO", "FOR", "IN", "ON"]),
];

const FALLBACK_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Uppercase, diacritic- and apostrophe-free form of a single word. */
function normalizeWord(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ'`´]/g, "")
    .toUpperCase();
}

/** Whitespace-separated words with diacritics folded away. */
function words(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Deterministic last-resort value derived from a seed string. Used only when
 * every name-based candidate is malformed or already taken (an empty name, or
 * a pathological collision run).
 */
function seededFallback(seed: string, taken: ReadonlySet<string>): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let attempt = 0; attempt < 4096; attempt++) {
    let n = (hash >>> 0) + attempt;
    let candidate = "";
    for (let i = 0; i < 3; i++) {
      candidate += FALLBACK_ALPHABET[n % FALLBACK_ALPHABET.length];
      n = Math.floor(n / FALLBACK_ALPHABET.length);
    }
    if (!taken.has(candidate)) return candidate;
  }

  return "ZZ9";
}

/** Candidate abbreviations for a name, best first. */
function candidatesFor(name: string): string[] {
  const allWords = words(name);
  const plain = teamAcronym(allWords.join(" "));
  const candidates: string[] = [plain];

  // Progressively drop connector tiers and re-acronym.
  let kept = allWords;
  for (const tier of DROPPABLE_TIERS) {
    const trimmed = kept.filter((w) => !tier.has(normalizeWord(w)));
    if (trimmed.length > 0 && trimmed.length < kept.length) {
      kept = trimmed;
      candidates.push(teamAcronym(kept.join(" ")));
    }
  }

  // Truncations, for names with no connectors left to drop.
  for (const base of [...candidates]) {
    if (base.length > 3) candidates.push(base.slice(0, 3));
  }

  // Collision handling only: no current franchise reaches this far.
  const first = normalizeWord(kept[0] ?? allWords[0] ?? "").replace(
    /[^A-Z0-9]/g,
    ""
  );
  candidates.push(first.slice(0, 3), first.slice(0, 2));
  const numberedBase = first.slice(0, 2);
  if (numberedBase.length === 2) {
    for (let digit = 2; digit <= 9; digit++) {
      candidates.push(`${numberedBase}${digit}`);
    }
  }

  return candidates;
}

/**
 * Derive a well-formed, unused abbreviation from a franchise name.
 *
 * Pure: the same (name, taken, seed) always produces the same value.
 *
 * @param name  franchise name
 * @param taken abbreviations already claimed by other franchises
 * @param seed  stable string for the last-resort fallback; callers pass the
 *              franchise ID so the fallback survives a rename
 */
export function deriveAbbreviation(
  name: string,
  taken: ReadonlySet<string> = new Set(),
  seed?: string
): string {
  for (const candidate of candidatesFor(name)) {
    if (!ABBREVIATION_PATTERN.test(candidate)) continue;
    if (taken.has(candidate)) continue;
    return candidate;
  }

  return seededFallback(seed || name, taken);
}

/**
 * Curated value if one exists for this franchise, otherwise a derived one.
 * A curated value is returned even if it collides with `taken`; curation is
 * the authority and the sync seeds `taken` with the whole curated map so a
 * derived value can never squat on one.
 */
export function resolveAbbreviation(
  franchiseId: string,
  name: string,
  taken: ReadonlySet<string> = new Set()
): string {
  const curated = CURATED_FRANCHISE_ABBREVIATIONS[franchiseId];
  if (curated && ABBREVIATION_PATTERN.test(curated)) return curated;
  return deriveAbbreviation(name, taken, franchiseId);
}

/**
 * Seed set for a sync run: every curated value plus every abbreviation already
 * persisted. Callers drop a row's own current value before resolving it so a
 * franchise can keep the abbreviation it already has.
 */
export function buildTakenSet(
  existing: Iterable<string | null | undefined>
): Set<string> {
  const taken = new Set<string>(Object.values(CURATED_FRANCHISE_ABBREVIATIONS));
  for (const value of existing) {
    if (value) taken.add(value);
  }
  return taken;
}
