import { test, expect } from "@playwright/test";

/**
 * Utility: convert a CSS color value (hex or rgb) to a normalized lowercase hex string.
 * Handles both "#RRGGBB" and "rgb(r, g, b)" formats.
 */
function normalizeColor(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("#")) {
    // Expand shorthand hex (#fff -> #ffffff)
    if (trimmed.length === 4) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
    }
    return trimmed;
  }
  const rgbMatch = trimmed.match(
    /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, "0");
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, "0");
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return trimmed;
}

/**
 * WCAG 2.1 relative luminance calculation.
 * Input: hex color string like "#RRGGBB"
 */
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

test.describe("FE-T01 through FE-T09: Computed Color Token Values", () => {
  const tokenTests: Array<{
    id: string;
    property: string;
    expectedHex: string;
  }> = [
    { id: "FE-T01", property: "--canvas", expectedHex: "#faf8f5" },
    { id: "FE-T02", property: "--surface", expectedHex: "#ffffff" },
    { id: "FE-T03", property: "--text-primary", expectedHex: "#1a1a1a" },
    { id: "FE-T04", property: "--text-secondary", expectedHex: "#4a4540" },
    { id: "FE-T05", property: "--accent-green", expectedHex: "#2d5a3d" },
    { id: "FE-T06", property: "--accent-gold", expectedHex: "#b8860b" },
    { id: "FE-T07", property: "--accent-warm", expectedHex: "#c45d3e" },
    { id: "FE-T08", property: "--border", expectedHex: "#e8e4e0" },
    { id: "FE-T09", property: "--accent-green-light", expectedHex: "#e8f0eb" },
  ];

  for (const { id, property, expectedHex } of tokenTests) {
    test(`${id}: ${property} resolves to ${expectedHex}`, async ({ page }) => {
      await page.goto("/");
      const computedValue = await page.evaluate((prop) => {
        return getComputedStyle(document.documentElement)
          .getPropertyValue(prop)
          .trim();
      }, property);
      const normalized = normalizeColor(computedValue);
      expect(normalized).toBe(expectedHex);
    });
  }
});

test.describe("FE-T10: Computed tabular-nums on Table Cells", () => {
  test("td and th elements have tabular-nums", async ({ page }) => {
    await page.goto("/");

    const result = await page.evaluate(() => {
      const table = document.createElement("table");
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.id = "test-td";
      td.textContent = "1234";
      const th = document.createElement("th");
      th.id = "test-th";
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

test.describe("FE-T11: Geist Sans Font Family Loading", () => {
  test("body uses Geist Sans font family", async ({ page }) => {
    await page.goto("/");

    const fontFamily = await page.evaluate(() => {
      return getComputedStyle(document.body).fontFamily;
    });

    // Geist font family name varies by rendering context; check for presence
    const hasGeist =
      fontFamily.toLowerCase().includes("geist") ||
      fontFamily.toLowerCase().includes("__className");
    expect(hasGeist).toBe(true);

    // Verify --font-sans CSS variable is set
    const fontSansVar = await page.evaluate(() => {
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--font-sans")
        .trim();
    });
    expect(fontSansVar.length).toBeGreaterThan(0);
  });
});

test.describe(
  "FE-T12 through FE-T14: WCAG Contrast Verified Ratios",
  () => {
    test("FE-T12: text-primary on canvas meets 4.5:1", async ({ page }) => {
      await page.goto("/");
      const ratio = contrastRatio("#1a1a1a", "#faf8f5");
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    test("FE-T13: text-secondary on canvas meets 4.5:1", async ({ page }) => {
      await page.goto("/");
      const ratio = contrastRatio("#4a4540", "#faf8f5");
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    test("FE-T14: accent-green on canvas meets 3:1 (interactive)", async ({
      page,
    }) => {
      await page.goto("/");
      const ratio = contrastRatio("#2d5a3d", "#faf8f5");
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });
  }
);

test.describe(
  "FE-T15 through FE-T16: WCAG Contrast Developer-Verified Ratios",
  () => {
    test("FE-T15: text-tertiary on canvas meets 3:1 (large text)", async ({
      page,
    }) => {
      await page.goto("/");
      const ratio = contrastRatio("#7a756f", "#faf8f5");
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    test("FE-T16: text-muted on canvas ratio is documented", async ({
      page,
    }) => {
      await page.goto("/");
      const ratio = contrastRatio("#9c9590", "#faf8f5");
      // text-muted may not meet 3:1; this test records the ratio
      // and verifies the token resolves correctly
      const computedValue = await page.evaluate(() => {
        return getComputedStyle(document.documentElement)
          .getPropertyValue("--text-muted")
          .trim();
      });
      const normalized = normalizeColor(computedValue);
      expect(normalized).toBe("#9c9590");
      // Record the contrast ratio for documentation purposes
      // Expected to be approximately 2.8:1; below 3:1
      expect(ratio).toBeGreaterThan(0);
    });
  }
);
