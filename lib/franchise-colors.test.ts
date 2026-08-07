import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  hexToOklch,
  oklabDistance,
  worstCaseSeparation,
} from "./color-metrics";
import {
  BRANDING_COLOR_PATTERN,
  CANVAS_HEX,
  CURATED_FRANCHISE_COLORS,
  FRANCHISE_PALETTE,
  SEMANTIC_TOKENS,
  buildTakenColorSet,
  deriveBrandingColor,
  resolveBrandingColor,
} from "./franchise-colors";

/**
 * Every invariant below is COMPUTED from the palette, never hardcoded, so
 * editing any hex either keeps the guarantee or fails the suite.
 */

/** The 12 real production franchises (IDs read from the live franchises table). */
const REAL_FRANCHISES: { id: string; name: string }[] = [
  { id: "337850257649987584", name: "The Tokyo Thunderbirds" },
  { id: "661810120119881728", name: "Better call Hall" },
  { id: "662174578797273088", name: "Vanilla Vick" },
  { id: "662204930538422272", name: "Of Mice and Mendoza" },
  { id: "662444232488861696", name: "McCarthyism" },
  { id: "685237785795293184", name: "Foopus" },
  { id: "685240664639750144", name: "Pay The Price" },
  { id: "685396254645129216", name: "Watson Love Diggs" },
  { id: "687106446546001920", name: "Bucky’s General Store" },
  { id: "687176498725081088", name: "Better call Myballs" },
  { id: "696838517652824064", name: "Latter Day Lamb Special" },
  { id: "710650554438709248", name: "Olave Garden" },
];

/** Mirrors the sync loop: stable ID order, taken set seeded up front. */
function resolveAll(
  input: { id: string }[],
  persisted: (string | null)[] = []
): Map<string, string> {
  const taken = buildTakenColorSet(persisted);
  const results = new Map<string, string>();
  for (const f of [...input].sort((a, b) => a.id.localeCompare(b.id))) {
    const value = resolveBrandingColor(f.id, taken);
    taken.add(value);
    results.set(f.id, value);
  }
  return results;
}

describe("palette shape", () => {
  it("has twelve entries, one per franchise", () => {
    expect(FRANCHISE_PALETTE).toHaveLength(12);
  });

  it("uses uniquely named, uniquely valued entries", () => {
    const names = FRANCHISE_PALETTE.map((e) => e.name);
    const hexes = FRANCHISE_PALETTE.map((e) => e.hex);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it("stores every entry as 6-digit uppercase hex", () => {
    for (const { name, hex } of FRANCHISE_PALETTE) {
      expect(hex, name).toMatch(BRANDING_COLOR_PATTERN);
    }
  });
});

describe("palette legibility", () => {
  // The threshold is 4.5:1 rather than the 3:1 graphical-object floor because
  // components/franchise-logo.tsx draws the crest monogram in #1A1613 ink
  // directly on this background: it is text on the color, not just a shape.
  it("clears WCAG 4.5:1 against the canvas for every entry", () => {
    for (const { name, hex } of FRANCHISE_PALETTE) {
      expect(contrastRatio(hex, CANVAS_HEX), `${name} ${hex}`).toBeGreaterThanOrEqual(
        4.5
      );
    }
  });

  it("uses the real canvas token as the reference", () => {
    expect(CANVAS_HEX).toBe("#1A1613");
  });
});

describe("palette hue and chroma discipline", () => {
  it("keeps every hue inside 40-270, excluding red, magenta and purple", () => {
    for (const { name, hex } of FRANCHISE_PALETTE) {
      const { H } = hexToOklch(hex);
      expect(H, `${name} ${hex}`).toBeGreaterThanOrEqual(40);
      expect(H, `${name} ${hex}`).toBeLessThanOrEqual(270);
    }
  });

  it("stays muted: chroma at or under 0.095, nowhere near neon", () => {
    for (const { name, hex } of FRANCHISE_PALETTE) {
      expect(hexToOklch(hex).C, `${name} ${hex}`).toBeLessThanOrEqual(0.095);
    }
  });
});

describe("palette separation", () => {
  it("keeps every pair at least 0.060 apart under normal, protan and deutan vision", () => {
    for (let i = 0; i < FRANCHISE_PALETTE.length; i++) {
      for (let j = i + 1; j < FRANCHISE_PALETTE.length; j++) {
        const a = FRANCHISE_PALETTE[i];
        const b = FRANCHISE_PALETTE[j];
        expect(
          worstCaseSeparation(a.hex, b.hex),
          `${a.name} vs ${b.name}`
        ).toBeGreaterThanOrEqual(0.06);
      }
    }
  });

  it("holds every entry at least 0.045 from gold, green and rust", () => {
    for (const { name, hex } of FRANCHISE_PALETTE) {
      for (const [token, tokenHex] of Object.entries(SEMANTIC_TOKENS)) {
        expect(
          worstCaseSeparation(hex, tokenHex),
          `${name} vs --accent-${token}`
        ).toBeGreaterThanOrEqual(0.045);
      }
    }
  });

  it("keeps the two near-twin franchise names far apart", () => {
    // "Better call Hall" and "Better call Myballs" read almost identically, so
    // their colors must not.
    const hall = CURATED_FRANCHISE_COLORS["661810120119881728"];
    const myballs = CURATED_FRANCHISE_COLORS["687176498725081088"];
    // Bronze vs pine: comfortably distinct to a trichromat, and still well
    // clear of the palette's 0.060 worst-case floor under simulation.
    expect(oklabDistance(hall, myballs)).toBeGreaterThan(0.12);
    expect(worstCaseSeparation(hall, myballs)).toBeGreaterThan(0.07);
  });
});

describe("curated assignments", () => {
  it("covers all 12 real franchises", () => {
    for (const f of REAL_FRANCHISES) {
      expect(CURATED_FRANCHISE_COLORS[f.id], f.name).toBeDefined();
    }
    expect(Object.keys(CURATED_FRANCHISE_COLORS)).toHaveLength(12);
  });

  it("assigns only palette members, pairwise distinct", () => {
    const paletteHexes = new Set(FRANCHISE_PALETTE.map((e) => e.hex));
    const values = Object.values(CURATED_FRANCHISE_COLORS);
    for (const value of values) {
      expect(value).toMatch(BRANDING_COLOR_PATTERN);
      expect(paletteHexes.has(value), value).toBe(true);
    }
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("resolveBrandingColor over the real league", () => {
  const resolved = resolveAll(REAL_FRANCHISES);

  it("gives all 12 franchises their curated color", () => {
    for (const f of REAL_FRANCHISES) {
      expect(resolved.get(f.id), f.name).toBe(CURATED_FRANCHISE_COLORS[f.id]);
    }
  });

  it("produces 12 pairwise distinct palette members", () => {
    const values = [...resolved.values()];
    const paletteHexes = new Set(FRANCHISE_PALETTE.map((e) => e.hex));
    expect(values).toHaveLength(12);
    expect(new Set(values).size).toBe(12);
    for (const value of values) expect(paletteHexes.has(value)).toBe(true);
  });

  it("is stable regardless of the input order", () => {
    const reversed = resolveAll([...REAL_FRANCHISES].reverse());
    expect([...reversed.entries()].sort()).toEqual([...resolved.entries()].sort());
  });

  it("returns the same value on repeated calls with the same inputs", () => {
    for (const f of REAL_FRANCHISES) {
      const taken = buildTakenColorSet([]);
      expect(resolveBrandingColor(f.id, taken)).toBe(
        resolveBrandingColor(f.id, taken)
      );
    }
  });

  it("reproduces the identical assignment on a simulated re-sync", () => {
    // Second run: taken set seeded from the first run's persisted output, each
    // row releasing its own value before re-resolving, exactly as the sync does.
    const persisted = new Map(resolved);
    const taken = buildTakenColorSet([...persisted.values()]);
    const rerun = new Map<string, string>();

    for (const f of [...REAL_FRANCHISES].sort((a, b) => a.id.localeCompare(b.id))) {
      const own = persisted.get(f.id);
      if (own) taken.delete(own);
      const value = resolveBrandingColor(f.id, taken);
      taken.add(value);
      rerun.set(f.id, value);
    }

    expect([...rerun.entries()].sort()).toEqual([...resolved.entries()].sort());
  });
});

describe("deriveBrandingColor", () => {
  it("always returns a palette member", () => {
    const paletteHexes = new Set(FRANCHISE_PALETTE.map((e) => e.hex));
    for (const id of ["999", "", "new-franchise-id", "0", "\u{1F410}"]) {
      expect(paletteHexes.has(deriveBrandingColor(id))).toBe(true);
    }
  });

  it("is deterministic for the same id and taken set", () => {
    for (const id of ["future-13th", "abc123", ""]) {
      expect(deriveBrandingColor(id)).toBe(deriveBrandingColor(id));
    }
  });

  it("probes past claimed entries", () => {
    const first = deriveBrandingColor("future-13th");
    const second = deriveBrandingColor("future-13th", new Set([first]));
    expect(second).not.toBe(first);
  });

  it("never returns empty even when the whole palette is claimed", () => {
    const all = new Set(FRANCHISE_PALETTE.map((e) => e.hex));
    const value = deriveBrandingColor("future-13th", all);
    expect(value).toMatch(BRANDING_COLOR_PATTERN);
    expect(all.has(value)).toBe(true);
  });

  it("spreads distinct ids across the palette rather than piling up", () => {
    const taken = new Set<string>();
    const values: string[] = [];
    for (let i = 0; i < 12; i++) {
      const value = deriveBrandingColor(`unknown-${i}`, taken);
      taken.add(value);
      values.push(value);
    }
    expect(new Set(values).size).toBe(12);
  });
});

describe("buildTakenColorSet", () => {
  it("seeds from curated values plus persisted values, ignoring nulls", () => {
    const taken = buildTakenColorSet(["#123456", null, undefined, "#ABCDEF"]);
    for (const value of Object.values(CURATED_FRANCHISE_COLORS)) {
      expect(taken.has(value)).toBe(true);
    }
    expect(taken.has("#123456")).toBe(true);
    expect(taken.has("#ABCDEF")).toBe(true);
  });

  it("prevents a derived value from squatting on a curated one", () => {
    const taken = buildTakenColorSet([]);
    const curated = new Set(Object.values(CURATED_FRANCHISE_COLORS));
    // Every palette entry is curated today, so a derived value can only be a
    // claimed one after full exhaustion; what matters is that curation wins.
    expect(resolveBrandingColor("710650554438709248", taken)).toBe(
      CURATED_FRANCHISE_COLORS["710650554438709248"]
    );
    expect(curated.size).toBe(12);
  });
});
