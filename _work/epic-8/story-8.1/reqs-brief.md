---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 8.1 - Tone Down Team Award Stats & Add Icons to Awards and Sting Cards
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: None
---

# Implementation Brief: Story 8.1

## Story Reference
Epic 8, Story 8.1: Tone Down Team Award Stats & Add Icons to Awards and Sting Cards

## Restated Acceptance Criteria

1. **AC1:** Team award card stat value uses `text-h2` (28-32px, Bold 700) instead of `text-display` (56-64px, Black 900)
2. **AC2:** Each team award card displays a small thematic SVG icon (16-20px) next to the label
3. **AC3:** Each sting card displays a small thematic SVG icon next to the label
4. **AC4:** Player award cards also receive small thematic SVG icons next to their labels
5. **AC5:** Icons scale appropriately on mobile without breaking card layout

## Database Changes
None.

## API Endpoints
None.

## Validation Schemas
None.

## Business Rules

### Stat Size Reduction
- `components/team-award-card.tsx` line 40: change `text-display` to `text-h2` on the stat `<p>` element
- This brings the stat from 56-64px/Black 900 down to 28-32px/Bold 700, consistent with `StingCard` which already uses `text-h3`

### Icon System
- Create a centralized icon map in `lib/award-icons.tsx` that maps award label strings to inline SVG components
- Each SVG icon should be 18px, rendered in the card's tone color at reduced opacity
- Icons are placed inline next to the label text (left of label, inside the caption row)
- The icon map should be a simple Record<string, ReactNode> keyed by normalized label name

### Suggested Icon Mapping

**Team Awards (positive tone):**
- "Point Machine" / "Most Points" -> target/bullseye icon
- "Iron Curtain" / "Fewest Points Against" -> shield icon
- "Regular Season King" / "Best Record" -> crown icon

**Sting Cards (warm tone):**
- "League Doormat" / "Worst Record" -> thumbs-down icon
- "Glass Cannon" / "Most Points in a Loss" -> broken-glass/lightning icon
- "Punching Bag" / "Most Points Against" -> boxing-glove icon
- "Coaching Malpractice" -> clipboard-x icon

**Player Awards (gold tone):**
- "Best QB" -> football icon
- "Best RB" -> running figure icon
- "Best WR" -> hands-catching icon
- "Best TE" -> star icon

### Fallback
If a label doesn't match any icon in the map, render no icon (label-only, current behavior).

## Files to Modify

### `lib/award-icons.tsx` (NEW)
- Export `getAwardIcon(label: string): React.ReactNode | null`
- Contains inline SVG components for each icon
- Icons are 18px viewBox, use `currentColor` for fill so they inherit text color

### `components/team-award-card.tsx`
- Import `getAwardIcon` from `lib/award-icons`
- Change stat class from `text-display` to `text-h2` (line 40)
- Add icon rendering next to label in the caption row (line 37-39)
- Icon gets same tone color as label via `labelStyles[tone]`

### `components/sting-card.tsx`
- Import `getAwardIcon` from `lib/award-icons`
- Add icon rendering next to label in the caption row (line 25-27)
- Icon color: `text-accent-warm` (matching label)

### `components/player-award-card.tsx`
- Import `getAwardIcon` from `lib/award-icons`
- Add icon rendering next to the award label
- Icon color: `text-accent-gold` (matching tone)

## Cross-Cutting Concerns Checklist
- [x] No database changes
- [x] No API changes
- [x] Accessibility: icons are decorative (aria-hidden="true"), label text provides meaning
- [x] No new dependencies (inline SVGs only)
- [x] WCAG: icons use tone colors that already meet contrast requirements
- [x] Mobile: icons are fixed 18px, won't break flex layout

## Forward Dependencies
None.

## Open Questions
None.
