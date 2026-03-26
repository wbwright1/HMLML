---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 8.2 - Draft Order Shows Full First Round on Hub with Link to All Rounds
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: UX spec says "top 4 picks by default on hub" but story explicitly overrides this to show all first-round picks. Story takes precedence as a polish fix.
---

# Implementation Brief: Story 8.2

## Story Reference
Epic 8, Story 8.2: Draft Order Shows Full First Round on Hub with Link to All Rounds

## Restated Acceptance Criteria

1. **AC1:** The preseason hub Draft Order section displays all 12 first-round picks (not truncated to 4)
2. **AC2:** A link reading "View Full Draft Order (All 3 Rounds)" appears below the pick list, navigating to `/drafts/[seasonYear]`
3. **AC3:** For legacy 10-team era, all available picks are shown without blank/empty state
4. **AC4:** All 12 picks are visible on mobile in a compact list without horizontal scrolling

## Database Changes
None. The `getPreseasonAwards()` query already returns all franchises ranked by draft order.

## API Endpoints
None affected.

## Validation Schemas
None affected.

## Business Rules

1. The `DraftOrderCard` currently truncates to 4 picks via `picks.slice(0, 4)` when `showAll` is false (default). This truncation must be removed; the component should display all picks passed to it.
2. The link target must be `/drafts/[seasonYear]` for the upcoming draft season, not the generic `/drafts` index.
3. Link text must read exactly: "View Full Draft Order (All 3 Rounds)"
4. The component needs a new `seasonYear` prop to construct the correct link URL.

## Files to Modify

### `components/draft-order-card.tsx`
- Remove the `picks.slice(0, 4)` default truncation (line 9: `const displayPicks = showAll ? picks : picks.slice(0, 4)` should become `const displayPicks = picks`)
- Add `seasonYear?: number` prop to `DraftOrderCardProps`
- Update link `href` from `/drafts` to `/drafts/${seasonYear}` when seasonYear is provided
- Update link text from "Full Draft Order" to "View Full Draft Order (All 3 Rounds)"
- Keep the `showAll` prop for backward compatibility but it no longer controls truncation of the main list; the link always shows if `seasonYear` is provided

### `app/page.tsx`
- In the `PreseasonHub` section where `<DraftOrderCard>` is rendered, derive the upcoming draft season year from `latestSeason?.seasonYear` or the current year
- Pass `seasonYear={upcomingDraftYear}` to `<DraftOrderCard>`

## Cross-Cutting Concerns Checklist
- [x] No database changes
- [x] No API changes
- [x] Accessibility: list semantics preserved (`<ol>`)
- [x] Mobile: compact list layout, no horizontal scroll (already the case)
- [x] No new dependencies

## Forward Dependencies
None. This is a self-contained UI fix.

## Open Questions
None.
