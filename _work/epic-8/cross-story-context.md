# Epic 8: UI/UX Polish Fixes - Cross-Story Context

## Epic Overview
A set of targeted UI/UX fixes addressing visual polish issues found during hub and page review. These are independent fixes that can be developed in parallel.

## Key Files
- `components/team-award-card.tsx` - Story 8.1 (stat size + icons)
- `components/sting-card.tsx` - Story 8.1 (icons)
- `components/player-award-card.tsx` - Story 8.1 (icons)
- `components/draft-order-card.tsx` - Story 8.2 (show all first round)
- `app/records/leaderboard-table.tsx` - Story 8.3 (table cleanup)
- `app/drafts/[seasonYear]/page.tsx` - Story 8.4 (spacing fix)
- `components/mobile-table-view.tsx` - Story 8.4 (card spacing)

## Design Constraints
- No icon library dependencies; use inline SVG or Unicode symbols
- All colors must use HMLML design tokens from globals.css
- WCAG AA contrast ratios required on all text
- No red/purple color pairings (league member has color blindness)
- Cards over tables on mobile

## Conventions from Prior Epics
- Typography scale: Display > H1 > H2 > H3 > Body Large > Body > Body Small > Caption
- 8px spacing base unit
- `tabular-nums` on all stat numbers
- Negative tracking on large text
- Tone-based card backgrounds (gold-light, warm-light, surface)
