---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 8.3 - Clean Up Records Leaderboard Table Styling
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: UXA should recommend desktop and mobile branding color treatment to replace the current left border. FranchiseIdentity already shows branding color via a swatch, so row border is redundant.
---

# Implementation Brief: Story 8.3

## Story Reference
Epic 8, Story 8.3: Clean Up Records Leaderboard Table Styling

## Restated Acceptance Criteria

1. **AC1:** Desktop table rows do NOT have a colored left border line
2. **AC2:** Franchise branding color is conveyed through the FranchiseIdentity component (already shows a color swatch), not row borders
3. **AC3:** All text colors use HMLML design tokens, not shadcn defaults
4. **AC4:** Mobile cards have uniform border (no colored left accent) OR UXA recommends a tasteful alternative
5. **AC5:** Sort indicators render cleanly with proper spacing
6. **AC6:** Active sort column is visually distinguishable

## Database Changes
None.

## API Endpoints
None.

## Validation Schemas
None.

## Business Rules

### Remove Left Border Lines
- **Desktop:** Remove `style={{ borderLeft: '3px solid ${entry.brandingColor ?? "var(--border)"}' }}` from `<tr>` elements (line 149)
- **Mobile:** Remove `style={{ borderLeftWidth: "3px", borderLeftColor: entry.brandingColor ?? "var(--border)" }}` from mobile card `<Link>` elements (line 222)
- The `FranchiseIdentity` component already renders a branding color swatch next to the team name; the row border is redundant visual noise

### Token Cleanup (Replace shadcn defaults with HMLML tokens)
| Current (shadcn) | Replace with (HMLML) |
|---|---|
| `text-gold` | `text-accent-gold` |
| `text-muted-foreground` | `text-text-tertiary` |
| `text-foreground` | `text-text-primary` |
| `bg-card` | `bg-surface` |
| `bg-muted/50` | `bg-surface-muted` |
| `hover:bg-muted/50` | `hover:bg-surface-muted` |

### Table Structure Improvements
- Keep the bottom border on rows (`border-b border-border/50`) for horizontal separation
- Ensure header row has `border-b border-border` (already present)
- Last row should have no bottom border (`last:border-0`, already present)
- Consider adding `hover:bg-surface-muted` on desktop rows for scanability (UXA to confirm)

## Files to Modify

### `app/records/leaderboard-table.tsx`
- Remove `style={{ borderLeft: ... }}` from desktop `<tr>` (line 149)
- Remove `style={{ borderLeftWidth: ..., borderLeftColor: ... }}` from mobile `<Link>` (line 222)
- Replace all shadcn token class names with HMLML equivalents per the table above
- Update `headerClass` variable (line 64): replace `text-muted-foreground` with `text-text-tertiary`, `hover:text-foreground` with `hover:text-text-primary`
- Update rank text colors: `text-gold` -> `text-accent-gold`, `text-muted-foreground` -> `text-text-tertiary`

## Cross-Cutting Concerns Checklist
- [x] No database changes
- [x] No API changes
- [x] Accessibility: removing decorative border doesn't affect screen readers; branding color still visible in FranchiseIdentity
- [x] WCAG: all replacement tokens meet AA contrast ratios (verified in design system)
- [x] Mobile: card layout preserved, just border treatment changes
- [x] No new dependencies

## Forward Dependencies
None.

## Open Questions
- UXA should confirm: should desktop rows get `hover:bg-surface-muted` for row hover feedback?
- UXA should recommend: for mobile cards, is a uniform `border-border` sufficient, or should a small color dot or thin top accent bar convey branding color?
