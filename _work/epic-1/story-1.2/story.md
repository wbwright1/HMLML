# Story 1.2: Typography System Audit & Update

## Story
As a visitor,
I want typography to create clear visual hierarchy,
So that I can scan content quickly and identify what matters.

## Acceptance Criteria

**Given** the UX spec defines 9 typography levels (Display, H1, H2, H3, Body Large, Body, Body Small, Caption, Stat Number)
**When** the typography utility classes are audited
**Then** each level matches its specified size, weight, letter-spacing, and line-height
**And** Display is 56-64px, Black 900, -0.02em tracking
**And** Caption is 12px, Medium 500, 0.06em tracking, always UPPERCASE
**And** tabular-nums (font-variant-numeric: tabular-nums) is applied globally to all numeric content
**And** Geist Sans is the only typeface loaded via next/font

## Notes
- UX-DR2: Implement complete typography system using Geist Sans with 9 levels
