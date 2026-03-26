# Story 8.3: Clean Up Records Leaderboard Table Styling

## User Story

**As a** visitor viewing the Records leaderboard,
**I want** the table to look clean and professional without a distracting colored line on the left,
**So that** the data is easy to scan and the table fits the "Press Box Evolved" aesthetic.

## Current Problem

- Each table row has `style={{ borderLeft: '3px solid ${entry.brandingColor}' }}` which creates a jarring colored stripe on the left edge
- On desktop, this left border sits outside the table's visual boundary and looks like a rendering artifact
- On mobile cards, the left border is applied via `borderLeftWidth: 3px` and `borderLeftColor` which is more intentional but still may look odd
- The table uses `text-gold` and `text-muted-foreground` (shadcn defaults) instead of HMLML brand tokens

## Acceptance Criteria

**Given** the records leaderboard table renders on desktop
**When** the page loads
**Then** the table rows do NOT have a colored left border line
**And** franchise branding color is conveyed through the `FranchiseIdentity` component (which already shows a color swatch) rather than row borders
**And** all text colors use HMLML design tokens (`text-text-primary`, `text-text-tertiary`, `text-accent-gold`) not shadcn defaults

**Given** the leaderboard renders on mobile (card view)
**When** the page loads
**Then** cards have a uniform border (no colored left accent) OR the UXA agent recommends a tasteful alternative (e.g., a small color dot, a thin top accent bar)
**And** cards use HMLML tokens consistently

**Given** the table has sortable columns
**When** the user clicks a column header
**Then** the sort indicator renders cleanly with proper spacing
**And** the active sort column is visually distinguishable

## Implementation Notes

- **File:** `app/records/leaderboard-table.tsx`
- Remove `style={{ borderLeft: ... }}` from desktop `<tr>` elements
- Remove `borderLeftWidth`/`borderLeftColor` from mobile card elements
- The `FranchiseIdentity` component already shows branding color; doubling it on the row is redundant
- Replace `text-gold` with `text-accent-gold`, `text-muted-foreground` with `text-text-tertiary`
- Replace `bg-card` with `bg-surface`, `bg-muted/50` with `bg-surface-muted`
- UXA agent should review and recommend the cleanest approach for both desktop and mobile
