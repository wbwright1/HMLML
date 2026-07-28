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
  "paper tiger": (
    <svg {...iconProps}>
      <path d="M8 2.5c2.5 0 4.5 1.5 4.5 4 0 3-2 4-2 6.5H5.5c0-2.5-2-3.5-2-6.5 0-2.5 2-4 4.5-4z" />
      <path d="M6 4.5v-2M10 4.5v-2" />
    </svg>
  ),
  "rock bottom": (
    <svg {...iconProps}>
      <path d="M8 2v7" />
      <path d="M5 6l3 3 3-3" />
      <path d="M2.5 13.5h11" />
    </svg>
  ),

  // Neutral / narrative superlatives
  "on fire": (
    <svg {...iconProps}>
      <path d="M8 1.5s3 3 3 6a3 3 0 01-6 0c0-1 .5-1.5.5-1.5s.5 1 1.5 1c1 0 1-1 1-1.5 0-1-1-2-1-2s2 0 3.5 2.5c.5 1 .5 2 .5 2.5" />
    </svg>
  ),
  "what could've been": (
    <svg {...iconProps}>
      <circle cx="8" cy="7" r="4.5" />
      <path d="M8 5.5v3M6.5 12.5h3" />
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

  // League Awards (Trophy Case: MVP / Championship MVP / Rookie of the Year)
  "regular season mvp": (
    <svg {...iconProps}>
      <path d="M2.5 12.5h11L14 5l-3 3-3-5-3 5-3-3 0.5 7.5z" />
      <line x1="2.5" y1="14" x2="13.5" y2="14" />
    </svg>
  ),
  "championship mvp": (
    <svg {...iconProps}>
      <path d="M4.5 2.5h7v2a3.5 3.5 0 01-7 0v-2z" />
      <path d="M4.5 3.5H2.5v1a2 2 0 002 2M11.5 3.5h2v1a2 2 0 01-2 2" />
      <path d="M8 8v2.5M6 13.5h4M6.5 13.5l.5-3h2l.5 3" />
    </svg>
  ),
  "rookie of the year": (
    <svg {...iconProps}>
      <path d="M8 2l1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 10.8 4.6 12.5l.7-3.8L2.5 6l3.8-.5L8 2z" />
    </svg>
  ),

  // Franchise Trophy Case: championship trophy-cup glyph
  "league champion": (
    <svg {...iconProps}>
      <path d="M4.5 2.5h7v2a3.5 3.5 0 01-7 0v-2z" />
      <path d="M4.5 3.5H2.5v1a2 2 0 002 2M11.5 3.5h2v1a2 2 0 01-2 2" />
      <path d="M8 8v2.5M6 13.5h4M6.5 13.5l.5-3h2l.5 3" />
    </svg>
  ),
};

export function getAwardIcon(label: string): ReactNode | null {
  const normalized = label.toLowerCase().trim();
  return icons[normalized] ?? null;
}

/**
 * Glyph for a league award type code ('regular_season_mvp' |
 * 'championship_mvp' | 'rookie_of_year'). Keyed off the award's full label so
 * it shares the icons map above; returns null for unknown types.
 */
export function getAwardTypeIcon(awardType: string): ReactNode | null {
  const key: Record<string, string> = {
    regular_season_mvp: "regular season mvp",
    championship_mvp: "championship mvp",
    rookie_of_year: "rookie of the year",
  };
  const iconKey = key[awardType];
  return iconKey ? (icons[iconKey] ?? null) : null;
}
