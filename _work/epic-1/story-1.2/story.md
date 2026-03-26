# Story 1.2: Press Box Evolved Theme Implementation

## Story
As a developer,
I want all design tokens (colors, typography, spacing) implemented in Tailwind CSS v4,
So that every component uses the brand system consistently.

## Acceptance Criteria

**Given** the Tailwind configuration
**When** the theme is applied
**Then** all 15 color tokens are defined as CSS custom properties (--canvas through --accent-warm-light)
**And** the typography scale is defined (Display through Caption with correct sizes, weights, letter-spacing, line-heights)
**And** the 8px spacing system tokens are available (space-1 through space-24)
**And** `font-variant-numeric: tabular-nums` is applied globally to numeric content
**And** Geist Sans is loaded via next/font as the single typeface
**And** shadcn/ui default theme colors are overridden with HMLML brand tokens
**And** all text/background combinations meet WCAG 2.1 AA contrast ratios

## Notes
- Reference the Visual Design Foundation section of the UX spec for exact hex values
- The color tokens must be defined as CSS custom properties for runtime access
- Typography letter-spacing values: Display -0.02em, H1 -0.015em, H2 -0.01em, Caption 0.06em
