import type { ReactNode } from "react";

const iconProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
  className: "shrink-0",
};

const icons: Record<string, ReactNode> = {
  // Team Awards (positive)
  "point machine": (
    <svg {...iconProps}>
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="8" r="3.5" />
      <circle cx="8" cy="8" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  ),
  "iron curtain": (
    <svg {...iconProps}>
      <path d="M8 1.5L2 4v4c0 3.5 2.5 5.5 6 7 3.5-1.5 6-3.5 6-7V4L8 1.5z" />
    </svg>
  ),
  "regular season king": (
    <svg {...iconProps}>
      <path d="M2.5 12.5h11L14 5l-3 3-3-5-3 5-3-3 0.5 7.5z" />
      <line x1="2.5" y1="14" x2="13.5" y2="14" />
    </svg>
  ),

  // Sting Cards (warm)
  "league doormat": (
    <svg {...iconProps}>
      <path d="M8 3v7" />
      <path d="M5 7l3 3 3-3" />
      <line x1="4" y1="13" x2="12" y2="13" />
    </svg>
  ),
  "glass cannon": (
    <svg {...iconProps}>
      <path d="M10.5 2L6 7.5h3.5L5.5 14" />
    </svg>
  ),
  "punching bag": (
    <svg {...iconProps}>
      <path d="M5 3h5a2 2 0 012 2v4a3 3 0 01-3 3H7a3 3 0 01-3-3V5a2 2 0 012-2z" />
      <path d="M7 12v2.5" />
      <path d="M9 12v2.5" />
      <path d="M5.5 3V1.5" />
      <path d="M10.5 3V1.5" />
    </svg>
  ),
  "coaching malpractice": (
    <svg {...iconProps}>
      <rect x="3.5" y="2" width="9" height="12" rx="1" />
      <line x1="3.5" y1="5" x2="12.5" y2="5" />
      <line x1="6.5" y1="7.5" x2="9.5" y2="10.5" />
      <line x1="9.5" y1="7.5" x2="6.5" y2="10.5" />
    </svg>
  ),

  // Player Awards (gold)
  "best qb": (
    <svg {...iconProps}>
      <ellipse cx="8" cy="8" rx="6" ry="3.5" transform="rotate(-30 8 8)" />
      <path d="M6.5 6l1.5 2 1.5-2" />
    </svg>
  ),
  "best rb": (
    <svg {...iconProps}>
      <circle cx="8" cy="3.5" r="1.5" />
      <path d="M6 7l-1.5 4h2L8 13l1.5-2h2L10 7" />
      <path d="M5 8.5l-1.5 1" />
    </svg>
  ),
  "best wr": (
    <svg {...iconProps}>
      <path d="M4 9c0-2 1.5-3.5 4-3.5S12 7 12 9" />
      <path d="M3.5 9.5c-.5.5-.5 1.5 0 2s1.5.5 2 0" />
      <path d="M12.5 9.5c.5.5.5 1.5 0 2s-1.5.5-2 0" />
    </svg>
  ),
  "best te": (
    <svg {...iconProps}>
      <path d="M8 2l1.8 3.6L14 6.2l-3 2.9.7 4.1L8 11.3 4.3 13.2l.7-4.1-3-2.9 4.2-.6L8 2z" />
    </svg>
  ),
};

export function getAwardIcon(label: string): ReactNode | null {
  const normalized = label.toLowerCase().trim();
  return icons[normalized] ?? null;
}
