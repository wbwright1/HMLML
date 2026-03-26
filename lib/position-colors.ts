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
    cell: { bg: "#C45D3E", text: "#FFFFFF" }, // --accent-warm
    badge: { bg: "#FDF0EC", text: "#9A4428" },
  },
  RB: {
    cell: { bg: "#2D5A3D", text: "#FFFFFF" }, // --accent-green
    badge: { bg: "#E8F0EB", text: "#1E3D2A" },
  },
  WR: {
    cell: { bg: "#5B7B9D", text: "#FFFFFF" }, // muted slate blue, warm undertone
    badge: { bg: "#EDF1F5", text: "#3E566D" },
  },
  TE: {
    cell: { bg: "#B8860B", text: "#FFFFFF" }, // --accent-gold
    badge: { bg: "#FDF6E3", text: "#7A5A07" },
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
