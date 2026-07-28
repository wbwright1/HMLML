// HMLML Bowl naming: the championship game each season carries a sequential
// Roman-numeral name, "HMLML Bowl {roman}". 2021 is HMLML Bowl I (the first
// season for which Sleeper data exists); anything before that is the
// legacy-era predecessor league and has no bowl name.

/** First season the "HMLML Bowl" naming applies to (HMLML Bowl I). */
export const FIRST_BOWL_SEASON = 2021;

const ROMAN_NUMERALS: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** Standard subtractive-notation Roman numeral conversion (1-3999). */
export function toRoman(n: number): string {
  let remaining = n;
  let result = "";
  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
}

/**
 * The "HMLML Bowl {roman}" name for a championship season, or null for
 * legacy-era seasons (before FIRST_BOWL_SEASON) that predate the naming.
 */
export function getBowlName(seasonYear: number): string | null {
  if (seasonYear < FIRST_BOWL_SEASON) return null;
  const bowlNumber = seasonYear - FIRST_BOWL_SEASON + 1;
  return `HMLML Bowl ${toRoman(bowlNumber)}`;
}

/**
 * Formats a season record as "W–L" (en dash), appending "–T" only when there
 * were ties. Returns null when wins or losses is null (incomplete data).
 */
export function formatRecord(
  wins: number | null,
  losses: number | null,
  ties: number | null,
): string | null {
  if (wins == null || losses == null) return null;
  const base = `${wins}–${losses}`;
  return ties != null && ties > 0 ? `${base}–${ties}T` : base;
}
