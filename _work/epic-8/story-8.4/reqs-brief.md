---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 8.4 - Fix Draft Detail Page Label Spacing
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: None
---

# Implementation Brief: Story 8.4

## Story Reference
Epic 8, Story 8.4: Fix Draft Detail Page Label Spacing

## Restated Acceptance Criteria

1. **AC1:** Section title ("Rookie Draft" or "Startup Draft") has comfortable spacing below it
2. **AC2:** Badges row (draft type, legacy era, pick count) has at least 12px gap from title above and 16px from content below
3. **AC3:** No negative margins (`-mt-8` or similar) are used
4. **AC4:** Each round header has consistent 32-40px vertical spacing from previous round's last row
5. **AC5:** Round header border-bottom has 8-12px padding below before the first pick
6. **AC6:** Mobile card layout has 16px internal padding with 8px+ vertical spacing between label/value pairs
7. **AC7:** No text appears truncated or overlapping on mobile

## Database Changes
None.

## API Endpoints
None.

## Validation Schemas
None.

## Business Rules

### Primary Fix: Remove Negative Margin
- `app/drafts/[seasonYear]/page.tsx` line 91: `className="flex flex-wrap items-center gap-3 -mt-8"`
- The `-mt-8` pulls the badges row up into the PageSection header space, causing the "squished" appearance
- Remove `-mt-8` entirely; use natural flow spacing from PageSection

### Spacing Adjustments
- The `space-y-10` on the rounds container (line 106) provides 40px between rounds, which is at the upper end of the 32-40px target. May adjust to `space-y-8` (32px) for consistency with the 8px base grid.
- Round headers use `space-y-3` (12px) between header and content (line 112), which is acceptable
- The `mt-4` on the rounds container (line 106) provides 16px gap between badges and first round

### PageSection Compatibility
- Read `components/page-section.tsx` to understand its built-in spacing
- The `-mt-8` was likely a hack to counteract PageSection's default padding; the correct fix is to remove the hack and let PageSection's spacing work naturally
- If PageSection adds too much gap, adjust its usage in the draft page rather than negative margins

### MobileTableView Card Spacing
- `components/mobile-table-view.tsx` line 21: cards use `space-y-2` (8px) between label/value pairs
- This meets the minimum 8px requirement but may feel tight; UXA should confirm if `space-y-3` (12px) is better
- Card padding is `p-4` (16px) which meets the AC requirement

## Files to Modify

### `app/drafts/[seasonYear]/page.tsx`
- Line 91: Remove `-mt-8` from badges row className
- Line 106: Consider changing `space-y-10` to `space-y-8` if rounds feel too spread out
- Verify overall flow after removing the negative margin

### `components/mobile-table-view.tsx` (conditional)
- If UXA recommends, change `space-y-2` to `space-y-3` on card internals (line 21)

## Cross-Cutting Concerns Checklist
- [x] No database changes
- [x] No API changes
- [x] Accessibility: spacing changes don't affect screen readers
- [x] Mobile: card padding and spacing verified against 8px grid
- [x] No new dependencies

## Forward Dependencies
None.

## Open Questions
- UXA should confirm: `space-y-2` vs `space-y-3` on MobileTableView card internals
- UXA should confirm: `space-y-10` vs `space-y-8` on rounds container
