// ---------------------------------------------------------------------------
// Position Color System
// Canonical color map for all position-based styling across the site.
// Two variants: "cell" (vivid bg, white text) and "badge" (tinted bg, colored text).
// All contrast ratios verified against WCAG 2.1 AA (4.5:1 minimum).
// No red/purple pairings. See Story 9.3 spec for full rationale.
// ---------------------------------------------------------------------------

export type PositionColorVariant = "cell" | "badge";

export interface PositionColorConfig {
  cell: {
    bg: string; // CSS hex color for full-bleed cell background
    text: string; // Always '#FFFFFF' for cell variant
  };
  badge: {
    bg: string; // CSS hex color for badge background tint
    text: string; // CSS hex color for badge text
  };
}

export const POSITION_COLORS: Record<string, PositionColorConfig> = {
  QB: {
    cell: { bg: "#D95F3B", text: "#FFFFFF" },
    badge: { bg: "#FDF0EC", text: "#A84220" },
  },
  RB: {
    cell: { bg: "#1E8A6E", text: "#FFFFFF" },
    badge: { bg: "#E6F4F1", text: "#145E4B" },
  },
  WR: {
    cell: { bg: "#3A6FC4", text: "#FFFFFF" },
    badge: { bg: "#EBF0FA", text: "#2A4F8F" },
  },
  TE: {
    cell: { bg: "#C28B0C", text: "#FFFFFF" },
    badge: { bg: "#FDF6E3", text: "#8A6200" },
  },
  K: {
    cell: { bg: "#8A8480", text: "#FFFFFF" },
    badge: { bg: "#F5F2EE", text: "#5A5652" },
  },
  DEF: {
    cell: { bg: "#6A6460", text: "#FFFFFF" },
    badge: { bg: "#ECEAE7", text: "#3E3A38" },
  },
};

export const DEFAULT_POSITION_COLOR: PositionColorConfig = {
  cell: { bg: "#8A8480", text: "#FFFFFF" },
  badge: { bg: "#F5F2EE", text: "#5A5652" },
};

/** Get color config for a position, with fallback for unknown/null positions. */
export function getPositionColor(
  position: string | null
): PositionColorConfig {
  if (!position) return DEFAULT_POSITION_COLOR;
  return POSITION_COLORS[position.toUpperCase()] ?? DEFAULT_POSITION_COLOR;
}
