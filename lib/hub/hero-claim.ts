// The hero headline's claim, and the numeral helpers every surface under the
// hero uses to avoid restating it. Its own module so lib/hub/between-weeks.ts
// (the Game of the Week blurb) and lib/hub/week-recap.ts (the recap card
// headline) can read it without importing the hero ladder, which itself
// imports between-weeks.

/**
 * What a hero line asserts, so the surfaces under it can skip it. The hero
 * headline owns its fact: the recap card headline and the Game of the Week
 * blurb read this and state a different true fact instead of echoing it.
 *   * kind: the fact family ("blowout" is last week's biggest margin, and so
 *     on; "slate" is a line about this week's games, "none" the fallback);
 *   * franchiseIds: the teams the fact is about (loser first for a final);
 *   * numbers: every numeral the headline printed, exactly as printed.
 */
export type HeroClaimKind =
  | "blowout"
  | "monster-score"
  | "photo-finish"
  | "dud"
  | "slate"
  | "none";

export interface HeroClaim {
  kind: HeroClaimKind;
  franchiseIds: readonly string[];
  numbers: readonly string[];
}

/** A claim that asserts nothing (no hero, or the neutral fallback). */
export const NO_HERO_CLAIM: HeroClaim = { kind: "none", franchiseIds: [], numbers: [] };

/**
 * Splits copy into numeral ("64.2", "2-0", "0-3") and prose runs. Backs
 * `numeralsIn` and the hero dedupe checks; the hero itself renders its
 * headline as one serif run (see components/hub/between-weeks-hub.tsx), so
 * nothing maps these parts to a mono span any more.
 */
export function numeralSegments(text: string): { text: string; numeral: boolean }[] {
  return text
    .split(/(\d+(?:[.,]\d+)*(?:-\d+)*)/g)
    .filter((p) => p.length > 0)
    .map((p) => ({ text: p, numeral: /^\d/.test(p) }));
}

/** Every numeral in `text`, exactly as printed. */
export function numeralsIn(text: string): string[] {
  return numeralSegments(text)
    .filter((p) => p.numeral)
    .map((p) => p.text);
}

/**
 * True when `text` prints a number the hero claim already printed. The two
 * dedupe consumers use this as the backstop under the kind check, so the
 * exact figure in the headline never appears again right below it.
 */
export function repeatsHeroNumber(text: string, claim: HeroClaim | null | undefined): boolean {
  if (!claim || claim.numbers.length === 0) return false;
  const printed = new Set(claim.numbers);
  return numeralsIn(text).some((n) => printed.has(n));
}
