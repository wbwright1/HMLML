/**
 * Franchise branding colors (6-digit uppercase hex).
 *
 * Sleeper exposes no team-color field, so like the abbreviation in
 * `lib/franchise-abbreviations.ts` the value cannot be synced: it is assigned
 * locally from a curated palette and written by the same franchise upsert.
 *
 * ## Where the color lands
 *
 * The binding constraint is `components/franchise-logo.tsx`, which paints the
 * crest tile with this color and draws the monogram on top in `#1A1613`. Dark
 * ink on the color means **every palette entry must clear WCAG 4.5:1 against
 * the canvas `#1A1613`**, which also satisfies the 3:1 graphical-object floor
 * for the other three consumers (the crest ring in `franchise-identity.tsx`,
 * the team stripe in `matchup-row.tsx`, the bracket rows in
 * `playoff-bracket-rounds.tsx`). A dark franchise color is not an option while
 * the monogram is drawn in canvas ink.
 *
 * ## How the palette was built
 *
 * Every entry satisfies, and `franchise-colors.test.ts` recomputes:
 *
 *   1. contrast >= 4.5:1 vs `#1A1613`
 *   2. OKLCH hue inside 40-270, i.e. warm tan through green, teal and blue,
 *      stopping short of violet. Red, magenta and purple are excluded
 *      wholesale rather than merely spaced out, per the league's red/purple
 *      color blindness rule.
 *   3. OKLCH chroma <= 0.095: muted, never neon (sRGB-saturated colors run
 *      0.15-0.30).
 *   4. held away from the three semantically loaded tokens, `--accent-gold`
 *      `#E2B858`, `--accent-green` `#8FBF7F` and `--accent-warm` `#C97C6A`, so
 *      a crest ring never reads as the win green or the loss rust.
 *   5. pairwise distinct under normal, protanope and deuteranope vision.
 *
 * The palette skews cool on purpose: gold and rust already own the warm end of
 * this canvas and are semantically loaded, so the muted-warm band that is
 * simultaneously canvas-legible and far from both accents is thin. Three warm
 * anchors (bone, bronze, olive) plus fern is the most warmth it can carry.
 *
 * ## Honest limitation
 *
 * Twelve muted colors on a red/purple-free wheel cannot be made *fully*
 * mutually identifiable to a protanope. The worst pair measures ~0.065 OKLab
 * under simulation, which is a perceptible difference but not a confident one.
 * That is acceptable here only because the color never carries information on
 * its own: it appears on a crest that always sits beside the franchise name
 * and its monogram, so it is decoration on top of a label, never the label.
 */

/** The app canvas. The monogram is drawn in this color on top of the crest. */
export const CANVAS_HEX = "#1A1613";

/** Semantically loaded tokens the palette must stay clear of. */
export const SEMANTIC_TOKENS = Object.freeze({
  gold: "#E2B858",
  green: "#8FBF7F",
  warm: "#C97C6A",
});

export interface PaletteEntry {
  name: string;
  hex: string;
}

/**
 * The twelve branding colors, ordered by hue from warm tan around to blue.
 * Measured contrast vs `#1A1613` in the comment on each line.
 */
export const FRANCHISE_PALETTE: readonly PaletteEntry[] = Object.freeze([
  { name: "bone", hex: "#F4D3C1" }, //       12.79  L .89 C .045 H 50
  { name: "bronze", hex: "#C19B5F" }, //      6.95  L .71 C .090 H 78
  { name: "olive", hex: "#908440" }, //       4.76  L .61 C .090 H 100
  { name: "fern", hex: "#BCCD8B" }, //       10.48  L .82 C .090 H 120
  { name: "moss", hex: "#93AD90" }, //        7.38  L .72 C .050 H 142
  { name: "mist", hex: "#A2C4B1" }, //        9.47  L .79 C .045 H 161
  { name: "pine", hex: "#509C8C" }, //        5.54  L .64 C .080 H 178
  { name: "glacier", hex: "#95EDED" }, //    13.37  L .89 C .085 H 196
  { name: "lagoon", hex: "#74AFBE" }, //      7.38  L .72 C .065 H 215
  { name: "marine", hex: "#4F88A5" }, //      4.62  L .60 C .075 H 232
  { name: "denim", hex: "#679ACA" }, //       6.04  L .67 C .090 H 248
  { name: "cornflower", hex: "#94B1EB" }, //  8.34  L .76 C .090 H 264
] as const);

/**
 * Per-franchise assignments, keyed by franchise ID (the Sleeper user_id),
 * never by name, so an assignment survives renames and ownership changes per
 * the Franchise Identity rule. Each entry names its franchise so a later
 * reader can tell which is which after a rename.
 *
 * Unlike the abbreviation map this ships populated: there is no name-derivable
 * "natural" color the way there is a natural acronym, so curation is the
 * primary path and derivation is only the fallback for an unknown ID.
 *
 * The assignments lean on the team names where the name offers one, notably
 * Olave Garden -> olive. The two near-twin names, "Better call Hall" and
 * "Better call Myballs", are deliberately given bronze and pine, which are far
 * apart under every simulation. Every other row is swappable at will: the
 * palette invariants hold for any permutation, so changing an assignment is a
 * one-line edit that does not touch the validation.
 */
export const CURATED_FRANCHISE_COLORS: Record<string, string> = {
  "337850257649987584": "#4F88A5", // The Tokyo Thunderbirds -> marine
  "661810120119881728": "#C19B5F", // Better call Hall -> bronze
  "662174578797273088": "#F4D3C1", // Vanilla Vick -> bone
  "662204930538422272": "#BCCD8B", // Of Mice and Mendoza -> fern
  "662444232488861696": "#679ACA", // McCarthyism -> denim
  "685237785795293184": "#A2C4B1", // Foopus -> mist
  "685240664639750144": "#95EDED", // Pay The Price -> glacier
  "685396254645129216": "#94B1EB", // Watson Love Diggs -> cornflower
  "687106446546001920": "#93AD90", // Bucky's General Store -> moss
  "687176498725081088": "#509C8C", // Better call Myballs -> pine
  "696838517652824064": "#74AFBE", // Latter Day Lamb Special -> lagoon
  "710650554438709248": "#908440", // Olave Garden -> olive
};

/** Valid shape for a stored branding color. */
export const BRANDING_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

/**
 * Deterministic palette pick for a franchise ID that is not in the curated
 * map: FNV-1a hash of the ID into a palette index, probing forward for an
 * entry nobody has claimed.
 *
 * With twelve palette entries and twelve curated franchises this never runs
 * today; it is the path for a future thirteenth franchise or an ID the curated
 * map has not caught up with. If every entry is already claimed it returns the
 * hashed entry anyway rather than failing, so a sync re-run can never write
 * NULL over a franchise.
 *
 * Pure: the same (franchiseId, taken) always produces the same value.
 */
export function deriveBrandingColor(
  franchiseId: string,
  taken: ReadonlySet<string> = new Set()
): string {
  let hash = 2166136261;
  for (let i = 0; i < franchiseId.length; i++) {
    hash ^= franchiseId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const start = (hash >>> 0) % FRANCHISE_PALETTE.length;

  for (let offset = 0; offset < FRANCHISE_PALETTE.length; offset++) {
    const entry = FRANCHISE_PALETTE[(start + offset) % FRANCHISE_PALETTE.length];
    if (!taken.has(entry.hex)) return entry.hex;
  }

  return FRANCHISE_PALETTE[start].hex;
}

/**
 * Curated color if one exists for this franchise, otherwise a derived one.
 * A curated value is returned even if it collides with `taken`; curation is
 * the authority and the sync seeds `taken` with the whole curated map so a
 * derived value can never squat on one. Mirrors `resolveAbbreviation`.
 */
export function resolveBrandingColor(
  franchiseId: string,
  taken: ReadonlySet<string> = new Set()
): string {
  const curated = CURATED_FRANCHISE_COLORS[franchiseId];
  if (curated && BRANDING_COLOR_PATTERN.test(curated)) return curated;
  return deriveBrandingColor(franchiseId, taken);
}

/**
 * Seed set for a sync run: every curated value plus every color already
 * persisted. Callers drop a row's own current value before resolving it so a
 * franchise keeps the color it already has.
 */
export function buildTakenColorSet(
  existing: Iterable<string | null | undefined>
): Set<string> {
  const taken = new Set<string>(Object.values(CURATED_FRANCHISE_COLORS));
  for (const value of existing) {
    if (value) taken.add(value);
  }
  return taken;
}
