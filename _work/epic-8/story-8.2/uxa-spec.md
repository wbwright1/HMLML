---
## Orchestrator Summary
- **Agent**: UXA
- **Story**: 8.2 - Draft Order Shows Full First Round on Hub
- **Verdict**: COMPLETE
- **State transition**: reqs-complete -> uxa-complete
- **Flags for orchestrator**: None
---

# UXA Component & Interaction Spec: Story 8.2

## Components Affected

### DraftOrderCard (`components/draft-order-card.tsx`)

**Current State:** Shows 4 picks with "Full Draft Order" link to `/drafts`

**New State:** Shows all picks (12 for modern era, 10 for legacy) with "View Full Draft Order (All 3 Rounds)" link to `/drafts/[seasonYear]`

### Layout Changes

**Pick List:**
- Remove the `picks.slice(0, 4)` truncation; render all picks
- With 12 items, add alternating row backgrounds for scanability:
  - Odd rows: default (transparent)
  - Even rows: `bg-surface-muted/50` (very subtle)
- Each row padding: `py-1.5` (add vertical padding to existing layout for breathing room with 12 items)
- Keep existing layout: rank number (w-6, centered, bold) | franchise name (flex-1, medium) | record (tertiary, tabular-nums)

**Visual Rhythm:**
- No dividers needed; alternating backgrounds provide sufficient visual separation
- The compact `text-body-sm` size keeps 12 items from feeling overwhelming

**Link:**
- Text: "View Full Draft Order (All 3 Rounds)"
- Style: `text-body-sm font-medium text-accent-green hover:underline`
- The link always shows when `seasonYear` prop is provided
- Arrow suffix: add `→` after text for visual affordance

**New Prop:**
- `seasonYear?: number` for constructing link to `/drafts/[seasonYear]`

### Visual Result
```
DRAFT ORDER                    <- caption header

 1  Team Alpha         7-6    <- all 12 picks visible
 2  Team Beta          6-7       with alternating bg
 3  Team Gamma         8-5
 ...
12  Team Omega         3-10

View Full Draft Order (All 3 Rounds) →
```

## Responsive Behavior

### Desktop (md+)
- Card fits within the hub grid; 12 items at text-body-sm are ~360px tall
- No horizontal scroll needed

### Mobile (<md)
- Single column; card spans full width
- 12 items remain compact; no scroll needed
- Alternating backgrounds help scanability on narrow screens

## States
- **12 picks:** Standard modern league (expected state)
- **10 picks:** Legacy era; all shown, no empty slots
- **0 picks:** Should not occur (draft order only rendered when data exists)
- **No seasonYear prop:** Link falls back to `/drafts` (backward compatible)

## Accessibility
- `<ol>` semantic list preserved
- Each pick is a list item with rank, name, record
- Link has descriptive text (no "click here")
