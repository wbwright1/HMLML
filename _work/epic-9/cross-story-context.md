# Epic 9: Draft Board Train View - Cross-Story Context

## Epic Overview
Replace the current round-by-round table draft view with a visual "draft train" grid (teams as columns, rounds as rows, position-colored cells). Support both completed and upcoming drafts. Fix the 404 on the upcoming draft page.

## Key Files
- `components/draft-board.tsx` - NEW: Draft train grid component
- `components/position-badge.tsx` - Existing: needs color system update
- `lib/position-colors.ts` - NEW: shared position color map
- `app/drafts/[seasonYear]/page.tsx` - Existing: replace table view with train
- `app/drafts/page.tsx` - Existing: add upcoming draft entry
- `lib/queries/drafts.ts` - Existing: may need upcoming draft query

## Design Constraints
- Position colors must be vivid and distinct (not muted tokens)
- No red/purple pairing (league member has color blindness)
- WCAG AA contrast on all text over colored backgrounds
- Mobile: horizontal scroll with sticky headers
- Desktop: all 12 columns visible without scroll
- Cell dimensions: ~100-120px wide, ~50-60px tall
- Snake draft order: odd rounds L-to-R, even rounds R-to-L

## Data Shape
- `DraftPickWithFranchise` has: round, pickNumber, playerName, playerPosition, franchiseName, franchiseSlug, franchiseAbbreviation, franchiseBrandingColor
- Draft board needs picks grouped by round then ordered by pick position within round
- Upcoming drafts have no picks; show empty cells with pick slot numbers
