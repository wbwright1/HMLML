/**
 * Color measurement primitives.
 *
 * Pure functions with no dependencies: sRGB hex parsing, WCAG relative
 * luminance and contrast ratio, the OKLab/OKLCH perceptual space, and Vienot
 * dichromat simulation for protanopia and deuteranopia.
 *
 * These exist so the franchise palette in `lib/franchise-colors.ts` can be
 * *measured* rather than eyeballed: the palette test computes its invariants
 * (canvas contrast, hue band, chroma ceiling, colorblind-safe separation) from
 * the hexes themselves, so editing a hex either keeps the guarantees or fails
 * the suite. Nothing here is rendering code; nothing here reads the database.
 *
 * References:
 *   WCAG 2.1 relative luminance / contrast: w3.org/TR/WCAG21/#dfn-contrast-ratio
 *   OKLab: Bjorn Ottosson, "A perceptual color space for image processing"
 *   Dichromat simulation: Vienot, Brettel & Mollon (1999)
 */

export interface Rgb {
  /** 0-255 */
  r: number;
  /** 0-255 */
  g: number;
  /** 0-255 */
  b: number;
}

/** Linear-light sRGB components, 0-1. */
export interface LinearRgb {
  r: number;
  g: number;
  b: number;
}

export interface Oklab {
  /** Perceptual lightness, roughly 0-1. */
  L: number;
  a: number;
  b: number;
}

export interface Oklch {
  /** Perceptual lightness, roughly 0-1. */
  L: number;
  /** Chroma. sRGB-saturated colors run 0.15-0.30; muted colors sit under 0.10. */
  C: number;
  /** Hue angle in degrees, 0-360. */
  H: number;
}

export type Dichromacy = "protan" | "deutan";

const HEX_PATTERN = /^#?([0-9a-fA-F]{6})$/;

/** Parse a 6-digit hex string (with or without `#`) into 0-255 channels. */
export function hexToRgb(hex: string): Rgb {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) throw new Error(`Not a 6-digit hex color: ${hex}`);
  const value = parseInt(match[1], 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function channelToHex(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, "0").toUpperCase();
}

/** 6-digit uppercase hex, the stored format for a branding color. */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

/** sRGB gamma decode: 0-255 companded channel to 0-1 linear light. */
export function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB gamma encode: 0-1 linear light back to a 0-255 companded channel. */
export function linearChannelToSrgb(linear: number): number {
  const c = Math.max(0, Math.min(1, linear));
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return encoded * 255;
}

export function rgbToLinear({ r, g, b }: Rgb): LinearRgb {
  return {
    r: srgbChannelToLinear(r),
    g: srgbChannelToLinear(g),
    b: srgbChannelToLinear(b),
  };
}

export function linearToRgb({ r, g, b }: LinearRgb): Rgb {
  return {
    r: linearChannelToSrgb(r),
    g: linearChannelToSrgb(g),
    b: linearChannelToSrgb(b),
  };
}

/** WCAG 2.1 relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = rgbToLinear(hexToRgb(hex));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio, 1 (identical) to 21 (black on white).
 * Order-independent.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Linear-light sRGB to OKLab (Ottosson). */
export function linearRgbToOklab({ r, g, b }: LinearRgb): Oklab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** OKLab back to linear-light sRGB (Ottosson). May fall outside 0-1 gamut. */
export function oklabToLinearRgb({ L, a, b }: Oklab): LinearRgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function hexToOklab(hex: string): Oklab {
  return linearRgbToOklab(rgbToLinear(hexToRgb(hex)));
}

export function oklabToHex(lab: Oklab): string {
  return rgbToHex(linearToRgb(oklabToLinearRgb(lab)));
}

/** Cartesian OKLab to cylindrical OKLCH. Hue is degrees, 0-360. */
export function oklabToOklch({ L, a, b }: Oklab): Oklch {
  const C = Math.sqrt(a * a + b * b);
  const H = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { L, C, H };
}

export function hexToOklch(hex: string): Oklch {
  return oklabToOklch(hexToOklab(hex));
}

/**
 * Euclidean distance in OKLab. Roughly perceptually uniform, so a single
 * threshold is meaningful across the whole space. For scale: two colors 0.02
 * apart are hard to tell apart side by side; 0.06 is a clear but modest
 * difference; 0.20 is unmistakable.
 */
export function oklabDistance(a: string, b: string): number {
  const x = hexToOklab(a);
  const y = hexToOklab(b);
  const dL = x.L - y.L;
  const da = x.a - y.a;
  const db = x.b - y.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

// Hunt-Pointer-Estevez style LMS transform used by Vienot et al. (1999),
// applied to linear-light sRGB.
const RGB_TO_LMS = [
  [17.8824, 43.5161, 4.11935],
  [3.45565, 27.1554, 3.86714],
  [0.0299566, 0.184309, 1.46709],
] as const;

const LMS_TO_RGB = [
  [0.080944447, -0.130504409, 0.116721066],
  [-0.0102485335, 0.0540193266, -0.113614708],
  [-0.000365296938, -0.00412161469, 0.693511405],
] as const;

/**
 * Simulate how a dichromat sees a color, as the nearest color on their
 * reduced (2-dimensional) gamut. Protanopia loses the L cone, deuteranopia
 * the M cone; both collapse the red-green axis, which is why two colors that
 * look distinct to a trichromat can land on top of each other here.
 *
 * Returned as a 6-digit uppercase hex so it can be fed straight back into
 * `oklabDistance` and `contrastRatio`.
 */
export function simulateDichromacy(hex: string, kind: Dichromacy): string {
  const { r, g, b } = rgbToLinear(hexToRgb(hex));

  const L = RGB_TO_LMS[0][0] * r + RGB_TO_LMS[0][1] * g + RGB_TO_LMS[0][2] * b;
  const M = RGB_TO_LMS[1][0] * r + RGB_TO_LMS[1][1] * g + RGB_TO_LMS[1][2] * b;
  const S = RGB_TO_LMS[2][0] * r + RGB_TO_LMS[2][1] * g + RGB_TO_LMS[2][2] * b;

  let simL = L;
  let simM = M;
  const simS = S;

  if (kind === "protan") {
    simL = 2.02344 * M - 2.52581 * S;
  } else {
    simM = 0.494207 * L + 1.24827 * S;
  }

  const linear: LinearRgb = {
    r:
      LMS_TO_RGB[0][0] * simL + LMS_TO_RGB[0][1] * simM + LMS_TO_RGB[0][2] * simS,
    g:
      LMS_TO_RGB[1][0] * simL + LMS_TO_RGB[1][1] * simM + LMS_TO_RGB[1][2] * simS,
    b:
      LMS_TO_RGB[2][0] * simL + LMS_TO_RGB[2][1] * simM + LMS_TO_RGB[2][2] * simS,
  };

  return rgbToHex(linearToRgb(linear));
}

/**
 * The worst-case perceptual separation between two colors across normal,
 * protanope and deuteranope vision. This is the number that matters for a
 * palette: a pair only counts as distinguishable if it stays distinguishable
 * under every simulation.
 */
export function worstCaseSeparation(a: string, b: string): number {
  return Math.min(
    oklabDistance(a, b),
    oklabDistance(simulateDichromacy(a, "protan"), simulateDichromacy(b, "protan")),
    oklabDistance(simulateDichromacy(a, "deutan"), simulateDichromacy(b, "deutan"))
  );
}
