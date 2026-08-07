import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  hexToOklab,
  hexToOklch,
  hexToRgb,
  oklabDistance,
  oklabToHex,
  relativeLuminance,
  rgbToHex,
  simulateDichromacy,
  worstCaseSeparation,
} from "./color-metrics";

describe("hex parsing", () => {
  it("parses with and without the leading hash", () => {
    expect(hexToRgb("#4F88A5")).toEqual({ r: 0x4f, g: 0x88, b: 0xa5 });
    expect(hexToRgb("4f88a5")).toEqual({ r: 0x4f, g: 0x88, b: 0xa5 });
  });

  it("round-trips through rgbToHex in uppercase", () => {
    for (const hex of ["#000000", "#FFFFFF", "#1A1613", "#E2B858", "#95EDED"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });

  it("rejects anything that is not a 6-digit hex", () => {
    for (const bad of ["#FFF", "", "#GGGGGG", "rgb(1,2,3)", "#1234567"]) {
      expect(() => hexToRgb(bad)).toThrow();
    }
  });
});

describe("relative luminance", () => {
  it("anchors at the sRGB endpoints", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 6);
  });

  it("puts mid grey well below half, as gamma requires", () => {
    const mid = relativeLuminance("#808080");
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.25);
  });
});

describe("contrast ratio", () => {
  it("is 21 for black against white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 6);
  });

  it("is 1 for a color against itself", () => {
    for (const hex of ["#1A1613", "#E2B858", "#4F88A5"]) {
      expect(contrastRatio(hex, hex)).toBeCloseTo(1, 6);
    }
  });

  it("is order-independent", () => {
    expect(contrastRatio("#1A1613", "#F2EADC")).toBeCloseTo(
      contrastRatio("#F2EADC", "#1A1613"),
      10
    );
  });

  it("agrees with the documented contrast of the design tokens", () => {
    // CLAUDE.md records --text-muted #6E6759 as ~3.2:1 on the canvas and calls
    // it out as failing AA for body copy. If this drifts the metric is wrong.
    expect(contrastRatio("#6E6759", "#1A1613")).toBeGreaterThan(3.0);
    expect(contrastRatio("#6E6759", "#1A1613")).toBeLessThan(3.4);
  });
});

describe("OKLab", () => {
  it("round-trips a hex through OKLab within one 8-bit step", () => {
    for (const hex of [
      "#000000",
      "#FFFFFF",
      "#1A1613",
      "#E2B858",
      "#8FBF7F",
      "#C97C6A",
      "#4F88A5",
      "#95EDED",
    ]) {
      const back = hexToRgb(oklabToHex(hexToOklab(hex)));
      const original = hexToRgb(hex);
      expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(1);
    }
  });

  it("gives neutrals near-zero chroma and orders lightness", () => {
    expect(hexToOklch("#808080").C).toBeLessThan(0.001);
    expect(hexToOklch("#000000").L).toBeCloseTo(0, 3);
    expect(hexToOklch("#FFFFFF").L).toBeCloseTo(1, 3);
    expect(hexToOklch("#333333").L).toBeLessThan(hexToOklch("#CCCCCC").L);
  });

  it("places primaries in the expected hue quadrants", () => {
    const red = hexToOklch("#FF0000").H;
    const green = hexToOklch("#00FF00").H;
    const blue = hexToOklch("#0000FF").H;
    expect(red).toBeGreaterThan(20);
    expect(red).toBeLessThan(45);
    expect(green).toBeGreaterThan(120);
    expect(green).toBeLessThan(160);
    expect(blue).toBeGreaterThan(240);
    expect(blue).toBeLessThan(290);
  });

  it("measures distance as zero for identical colors and grows with difference", () => {
    expect(oklabDistance("#4F88A5", "#4F88A5")).toBeCloseTo(0, 10);
    expect(oklabDistance("#000000", "#FFFFFF")).toBeGreaterThan(0.9);
    expect(oklabDistance("#4F88A5", "#4F88A6")).toBeLessThan(
      oklabDistance("#4F88A5", "#E2B858")
    );
  });
});

describe("dichromat simulation", () => {
  it("leaves a neutral grey essentially unchanged", () => {
    for (const kind of ["protan", "deutan"] as const) {
      expect(oklabDistance("#808080", simulateDichromacy("#808080", kind))).toBeLessThan(
        0.03
      );
    }
  });

  it("collapses the red-green axis, the whole point of the simulation", () => {
    // Two equiluminant colors that differ only along OKLab's a axis (rose vs
    // teal-green, both L .65, b 0). A trichromat sees them as unmistakable;
    // both dichromats see them as near-neighbors. This is the exact failure
    // mode the franchise palette is designed around, which is why lightness is
    // matched here: an unmatched pair would keep its distance through the L
    // term and prove nothing about hue discrimination.
    const rose = "#C1758D";
    const teal = "#38A391";
    const normal = oklabDistance(rose, teal);
    expect(normal).toBeGreaterThan(0.15);

    const protan = oklabDistance(
      simulateDichromacy(rose, "protan"),
      simulateDichromacy(teal, "protan")
    );
    const deutan = oklabDistance(
      simulateDichromacy(rose, "deutan"),
      simulateDichromacy(teal, "deutan")
    );
    expect(protan).toBeLessThan(normal / 2);
    expect(deutan).toBeLessThan(normal / 5);
  });

  it("preserves the blue-yellow axis, which dichromats keep", () => {
    const normal = oklabDistance("#2050C0", "#E0C020");
    const deutan = oklabDistance(
      simulateDichromacy("#2050C0", "deutan"),
      simulateDichromacy("#E0C020", "deutan")
    );
    expect(deutan).toBeGreaterThan(normal * 0.5);
  });

  it("is deterministic", () => {
    expect(simulateDichromacy("#C19B5F", "protan")).toBe(
      simulateDichromacy("#C19B5F", "protan")
    );
  });
});

describe("worstCaseSeparation", () => {
  it("is zero for a color against itself", () => {
    expect(worstCaseSeparation("#4F88A5", "#4F88A5")).toBeCloseTo(0, 10);
  });

  it("never exceeds the plain OKLab distance", () => {
    const pairs: [string, string][] = [
      ["#C19B5F", "#93AD90"],
      ["#FF0000", "#00A000"],
      ["#95EDED", "#908440"],
    ];
    for (const [a, b] of pairs) {
      expect(worstCaseSeparation(a, b)).toBeLessThanOrEqual(
        oklabDistance(a, b) + 1e-12
      );
    }
  });

  it("is symmetric", () => {
    expect(worstCaseSeparation("#C19B5F", "#93AD90")).toBeCloseTo(
      worstCaseSeparation("#93AD90", "#C19B5F"),
      10
    );
  });
});
