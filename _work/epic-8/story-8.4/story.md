# Story 8.4: Fix Draft Detail Page Label Spacing

## User Story

**As a** visitor viewing a past draft (e.g., `/drafts/2025`),
**I want** the labels, badges, and round headers to have proper spacing,
**So that** the draft board is easy to read and does not look squished or cramped.

## Current Problem

- The `PageSection` component adds its own spacing, but the draft detail page applies `-mt-8` on the badges/metadata row which collapses spacing
- The badges row (`SuperlativeBadge` for "Startup"/"Rookie", legacy era tag, pick count) is pressed too close to the section header
- Round headers (`Round 1`, `Round 2`, etc.) within `space-y-10` may have inconsistent gaps after the recent spacing standardization commit
- The `MobileTableView` cards on mobile may have cramped label/value pairs

## Acceptance Criteria

**Given** a visitor navigates to a past draft detail page (e.g., `/drafts/2025`)
**When** the page loads
**Then** the section title ("Rookie Draft" or "Startup Draft") has comfortable spacing below it
**And** the badges row (draft type, legacy era, pick count) has at least 12px gap from the title above and 16px from the content below
**And** no negative margins (`-mt-8` or similar) are used to hack spacing

**Given** the draft detail page has multiple rounds
**When** the page loads
**Then** each round header ("Round 1", "Round 2", etc.) has consistent vertical spacing (32-40px) from the previous round's last row
**And** the round header border-bottom has 8-12px padding below it before the first pick

**Given** the draft detail page renders on mobile
**When** viewing the stacked card layout
**Then** each card has comfortable internal padding (16px)
**And** label/value pairs within each card have at least 8px vertical spacing
**And** no text appears truncated or overlapping

## Implementation Notes

- **File:** `app/drafts/[seasonYear]/page.tsx` - remove `-mt-8` from the badges flex container (line 91)
- Adjust `space-y-10` on the rounds container if needed (may need `space-y-8` after spacing standardization)
- **File:** `components/mobile-table-view.tsx` - verify `space-y-2` on card internals is sufficient; may need `space-y-3`
- **File:** `components/page-section.tsx` - check if its built-in spacing plays well with the draft page's custom layout
- The recent "App-wide spacing standardization" commit (67e2ea5) may have reduced gaps that were appropriate here; verify and adjust
