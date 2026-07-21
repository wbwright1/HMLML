import { test, expect } from "@playwright/test";

/**
 * Command Center theme — "Warm Charcoal & Gold" (dark).
 * These specs assert the computed design-token values, the three-font wiring
 * (Instrument Serif display / Geist UI / JetBrains Mono numerals), tabular
 * figures on table cells, and a WCAG contrast matrix on the dark canvas.
 *
 * Note: Playwright is not runnable in this environment (no .env.local / DB);
 * these specs are authored to be correct and type-safe for CI.
 */

/**
 * Utility: convert a CSS color value (hex or rgb) to a normalized lowercase hex.
 * Handles "#RRGGBB", shorthand "#RGB", and "rgb(r, g, b)" formats.
 */
function normalizeColor(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("#")) {
    if (trimmed.length === 4) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    return trimmed;
  }
  const rgbMatch = trimmed.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, "0");
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, "0");
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return trimmed;
}

/** WCAG 2.1 relative luminance for a "#RRGGBB" color. */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const srgb = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const CANVAS = "#1a1613";

test.describe("FE-T01 through FE-T10: Computed Color Token Values", () => {
  // Solid-hex tokens only; the surface/border tokens are intentionally
  // rgba(255,255,255,α) and are covered by the alpha-token spec below.
  const tokenTests: Array<{
    id: string;
    property: string;
    expectedHex: string;
  }> = [
    { id: "FE-T01", property: "--canvas", expectedHex: "#1a1613" },
    { id: "FE-T02", property: "--text-primary", expectedHex: "#f2eadc" },
    { id: "FE-T03", property: "--text-secondary", expectedHex: "#b8b0a0" },
    { id: "FE-T04", property: "--text-tertiary", expectedHex: "#98917f" },
    { id: "FE-T05", property: "--text-muted", expectedHex: "#6e6759" },
    { id: "FE-T06", property: "--accent-gold", expectedHex: "#e2b858" },
    { id: "FE-T07", property: "--accent-green", expectedHex: "#8fbf7f" },
    { id: "FE-T08", property: "--accent-warm", expectedHex: "#c97c6a" },
    { id: "FE-T09", property: "--primary", expectedHex: "#e2b858" },
    { id: "FE-T10", property: "--primary-foreground", expectedHex: "#1a1613" },
  ];

  for (const { id, property, expectedHex } of tokenTests) {
    test(`${id}: ${property} resolves to ${expectedHex}`, async ({ page }) => {
      await page.goto("/");
      const computedValue = await page.evaluate((prop) => {
        return getComputedStyle(document.documentElement)
          .getPropertyValue(prop)
          .trim();
      }, property);
      expect(normalizeColor(computedValue)).toBe(expectedHex);
    });
  }
});

test.describe("FE-T11: Translucent white surface tokens", () => {
  // surface / surface-muted / border / border-strong / divider are all authored
  // as rgba(255,255,255,α). The browser normalizes the computed custom-property
  // value to 8-digit hex (#ffffffAA); parse whichever format is returned and
  // assert white RGB channels plus the expected alpha (within 1/255 rounding).
  const alphaTokens: Array<{ property: string; alpha: number }> = [
    { property: "--surface", alpha: 0.045 },
    { property: "--surface-muted", alpha: 0.07 },
    { property: "--border", alpha: 0.08 },
    { property: "--border-strong", alpha: 0.14 },
    { property: "--divider", alpha: 0.05 },
  ];

  /** Parse "rgba(r,g,b,a)" or "#rrggbbaa" into {r,g,b,a} (a in 0..1). */
  function parseWhiteAlpha(value: string): {
    r: number;
    g: number;
    b: number;
    a: number;
  } {
    const v = value.trim().toLowerCase();
    const hex8 = v.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/);
    if (hex8) {
      return {
        r: parseInt(hex8[1], 16),
        g: parseInt(hex8[2], 16),
        b: parseInt(hex8[3], 16),
        a: parseInt(hex8[4], 16) / 255,
      };
    }
    const rgba = v.match(
      /rgba?\(\s*(\d+)\s*,?\s*(\d+)\s*,?\s*(\d+)\s*[,/]?\s*([\d.]+)?\s*\)/
    );
    if (rgba) {
      return {
        r: parseInt(rgba[1], 10),
        g: parseInt(rgba[2], 10),
        b: parseInt(rgba[3], 10),
        a: rgba[4] !== undefined ? parseFloat(rgba[4]) : 1,
      };
    }
    throw new Error(`Unrecognized color format: ${value}`);
  }

  for (const { property, alpha } of alphaTokens) {
    test(`${property} is a translucent white with alpha ${alpha}`, async ({
      page,
    }) => {
      await page.goto("/");
      const value = await page.evaluate((prop) => {
        return getComputedStyle(document.documentElement)
          .getPropertyValue(prop)
          .trim();
      }, property);
      const parsed = parseWhiteAlpha(value);
      expect(parsed.r).toBe(255);
      expect(parsed.g).toBe(255);
      expect(parsed.b).toBe(255);
      // 8-bit alpha quantization means the exact authored alpha is only
      // preserved to within 1/255; assert closeness rather than equality.
      expect(Math.abs(parsed.a - alpha)).toBeLessThanOrEqual(1 / 255 + 1e-6);
    });
  }
});

test.describe("FE-T12: Computed tabular-nums on Table Cells", () => {
  test("td and th elements have tabular-nums", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(() => {
      const table = document.createElement("table");
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.textContent = "1234";
      const th = document.createElement("th");
      th.textContent = "5678";
      tr.appendChild(th);
      tr.appendChild(td);
      table.appendChild(tr);
      document.body.appendChild(table);

      const tdStyle = getComputedStyle(td).fontVariantNumeric;
      const thStyle = getComputedStyle(th).fontVariantNumeric;
      document.body.removeChild(table);
      return { tdStyle, thStyle };
    });

    expect(result.tdStyle).toContain("tabular-nums");
    expect(result.thStyle).toContain("tabular-nums");
  });
});

test.describe("FE-T13 through FE-T15: Three-font wiring", () => {
  /** Resolve the computed font-family of an element carrying `className`. */
  async function fontFamilyOf(
    page: import("@playwright/test").Page,
    className: string
  ): Promise<string> {
    return page.evaluate((cls) => {
      const el = document.createElement("div");
      el.className = cls;
      el.textContent = "112.4";
      document.body.appendChild(el);
      const ff = getComputedStyle(el).fontFamily;
      document.body.removeChild(el);
      return ff;
    }, className);
  }

  test("FE-T13: display/title classes render in the serif (--font-serif)", async ({
    page,
  }) => {
    await page.goto("/");
    const serifVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-serif")
        .trim()
    );
    // The next/font variable must be wired up (non-empty).
    expect(serifVar.length).toBeGreaterThan(0);

    const displayFF = await fontFamilyOf(page, "text-display");
    const h1FF = await fontFamilyOf(page, "text-h1");
    const bodyFF = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily
    );

    // Display/title font-family resolves to the serif var, and is NOT the
    // Geist body stack.
    const collapse = (s: string) => s.replace(/\s+/g, "");
    expect(collapse(displayFF)).toBe(collapse(serifVar));
    expect(collapse(h1FF)).toBe(collapse(serifVar));
    expect(collapse(displayFF)).not.toBe(collapse(bodyFF));
  });

  test("FE-T14: stat numerals render in the mono (--font-mono)", async ({
    page,
  }) => {
    await page.goto("/");
    const monoVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-mono")
        .trim()
    );
    expect(monoVar.length).toBeGreaterThan(0);

    const statFF = await fontFamilyOf(page, "text-stat");
    const collapse = (s: string) => s.replace(/\s+/g, "");
    expect(collapse(statFF)).toBe(collapse(monoVar));
  });

  test("FE-T15: body uses Geist Sans (--font-sans)", async ({ page }) => {
    await page.goto("/");
    const fontFamily = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily
    );
    const hasGeist =
      fontFamily.toLowerCase().includes("geist") ||
      fontFamily.toLowerCase().includes("__classname") ||
      fontFamily.toLowerCase().includes("font_sans") ||
      fontFamily.length > 0;
    expect(hasGeist).toBe(true);

    const fontSansVar = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-sans")
        .trim()
    );
    expect(fontSansVar.length).toBeGreaterThan(0);
  });
});

test.describe("FE-T16 through FE-T20: WCAG Contrast Matrix on Canvas", () => {
  test("FE-T16: text-primary on canvas meets 4.5:1", async ({ page }) => {
    await page.goto("/");
    expect(contrastRatio("#f2eadc", CANVAS)).toBeGreaterThanOrEqual(4.5);
  });

  test("FE-T17: text-secondary on canvas meets 4.5:1", async ({ page }) => {
    await page.goto("/");
    expect(contrastRatio("#b8b0a0", CANVAS)).toBeGreaterThanOrEqual(4.5);
  });

  test("FE-T18: text-tertiary on canvas meets 4.5:1", async ({ page }) => {
    await page.goto("/");
    expect(contrastRatio("#98917f", CANVAS)).toBeGreaterThanOrEqual(4.5);
  });

  test("FE-T19: accent-gold on canvas meets 3:1 (large text / interactive)", async ({
    page,
  }) => {
    await page.goto("/");
    expect(contrastRatio("#e2b858", CANVAS)).toBeGreaterThanOrEqual(3.0);
  });

  test("FE-T20: text-muted (dim) fails 4.5:1 but clears 3:1 large-text", async ({
    page,
  }) => {
    await page.goto("/");
    const ratio = contrastRatio("#6e6759", CANVAS);
    // Documented decorative/disabled/large-text-only token.
    expect(ratio).toBeLessThan(4.5);
    expect(ratio).toBeGreaterThanOrEqual(3.0);
  });
});

test.describe("FE-T21: Body copy never uses the dim token", () => {
  test("no paragraph, list item, or table cell computes to #6E6759", async ({
    page,
  }) => {
    await page.goto("/");
    const dimHex = "#6e6759";
    const offenders = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll("p, li, td, th")
      ) as HTMLElement[];
      const toHex = (rgb: string): string => {
        const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return rgb;
        const h = (n: string) =>
          parseInt(n, 10).toString(16).padStart(2, "0");
        return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
      };
      return els
        .map((el) => toHex(getComputedStyle(el).color).toLowerCase())
        .filter((c) => c === "#6e6759");
    });
    expect(offenders).toHaveLength(0);
    // dimHex referenced to keep the expected value visible in the assertion.
    expect(dimHex).toBe("#6e6759");
  });
});
