// ---------------------------------------------------------------------------
// Position Color System — Command Center palette
// Canonical color map for all position-based styling across the site.
// Two variants:
//   "cell"  — vivid color background with dark ink (#1A1613) text
//   "badge" — vivid color text on a 14%-alpha tint of the same color
// All six chip colors are light enough that dark ink on them clears WCAG 2.1 AA
// (4.5:1); the vivid color as badge text over the dark canvas also clears 4.5:1
// (QB is the tightest at ~4.66:1). No red/purple pairings.
// ---------------------------------------------------------------------------

export type PositionColorVariant = "cell" | "badge";

export interface PositionColorConfig {
  cell: {
    bg: string; // CSS hex color for full-bleed cell background
    text: string; // Dark ink '#1A1613' for cell variant (dark-on-color)
  };
  badge: {
    bg: string; // 14%-alpha tint of the position color
    text: string; // The vivid position color
  };
}

const QB: PositionColorConfig = {
  cell: { bg: "#C97C6A", text: "#1A1613" },
  badge: { bg: "rgba(201,124,106,0.14)", text: "#C97C6A" },
};
const RB: PositionColorConfig = {
  cell: { bg: "#8FBF7F", text: "#1A1613" },
  badge: { bg: "rgba(143,191,127,0.14)", text: "#8FBF7F" },
};
const WR: PositionColorConfig = {
  cell: { bg: "#E2B858", text: "#1A1613" },
  badge: { bg: "rgba(226,184,88,0.14)", text: "#E2B858" },
};
const TE: PositionColorConfig = {
  cell: { bg: "#7FA8C9", text: "#1A1613" },
  badge: { bg: "rgba(127,168,201,0.14)", text: "#7FA8C9" },
};
const K: PositionColorConfig = {
  cell: { bg: "#9B8FC9", text: "#1A1613" },
  badge: { bg: "rgba(155,143,201,0.14)", text: "#9B8FC9" },
};
const DEF: PositionColorConfig = {
  cell: { bg: "#98917F", text: "#1A1613" },
  badge: { bg: "rgba(152,145,127,0.14)", text: "#98917F" },
};

export const POSITION_COLORS: Record<string, PositionColorConfig> = {
  QB,
  RB,
  WR,
  TE,
  K,
  DEF,
  DST: DEF, // Sleeper uses "DEF"; some sources use "DST" — same treatment
};

export const DEFAULT_POSITION_COLOR: PositionColorConfig = DEF;

/** Get color config for a position, with fallback for unknown/null positions. */
export function getPositionColor(
  position: string | null
): PositionColorConfig {
  if (!position) return DEFAULT_POSITION_COLOR;
  return POSITION_COLORS[position.toUpperCase()] ?? DEFAULT_POSITION_COLOR;
}
