---
## Orchestrator Summary
- **Agent**: UXA
- **Story**: 8.4 - Fix Draft Detail Page Label Spacing
- **Verdict**: COMPLETE
- **State transition**: reqs-complete -> uxa-complete
- **Flags for orchestrator**: None
---

# UXA Component & Interaction Spec: Story 8.4

## Root Cause

The `-mt-8` (negative 32px margin) on the badges flex container (line 91 of `app/drafts/[seasonYear]/page.tsx`) collapses into the PageSection's natural `space-y-6` (24px) gap, pulling the badges row into the title area. This creates the "squished" appearance.

## Fix: Remove Negative Margin

**Remove:** `-mt-8` from `className="flex flex-wrap items-center gap-3 -mt-8"`
**Result:** `className="flex flex-wrap items-center gap-3"`

The PageSection component provides `space-y-6` (24px) between its title and children. With `-mt-8` removed, the badges row gets the natural 24px gap from the section title, which is comfortable spacing.

## Complete Vertical Rhythm Specification

```
[Back link: "← All Drafts"]
    ↕ 24px (space-y-6 from section)
[Caption: "Draft Board"]
    ↕ 8px (space-y-2)
[H1: "2025 Draft"]
    ↕ 24px (PageSection space-y-6 to children)

--- PageSection: "Rookie Draft" ---
[Section title: "Rookie Draft"]
    ↕ 24px (PageSection space-y-6)
[Badges row: Rookie badge | Legacy Era | "24 picks · 3 rounds"]
    ↕ 16px (mt-4 on rounds container)

[Round 1 header: "Round 1" with border-b]
    ↕ 12px (space-y-3 between header and picks)
[Picks table/cards]
    ↕ 32px (space-y-8 between rounds — changed from space-y-10)
[Round 2 header: "Round 2" with border-b]
    ↕ 12px
[Picks table/cards]
    ↕ 32px
[Round 3 header]
...
```

## Spacing Decisions

### Between rounds: `space-y-8` (32px)
**Changed from `space-y-10` (40px).** Reason: 40px creates too much vertical whitespace between rounds after the global spacing standardization. 32px is comfortable separation while keeping the draft board feeling cohesive. 32px is a standard 8px-grid value.

### MobileTableView card internals: Keep `space-y-2` (8px)
**No change.** The current 8px gap between label/value pairs meets the AC minimum and feels appropriate for the compact card layout. `space-y-3` (12px) would make each card too tall with 4 rows, and 12 cards per round would create excessive scrolling.

### Card padding: Keep `p-4` (16px)
Already meets the AC requirement. No change.

## Components Affected

### `app/drafts/[seasonYear]/page.tsx`
1. Line 91: Remove `-mt-8` from badges row
2. Line 106: Change `space-y-10` to `space-y-8`

### `components/mobile-table-view.tsx`
No changes. Current spacing is appropriate.

### `components/page-section.tsx`
No changes. Its `space-y-6` provides the natural gap.

## Responsive Behavior

### Desktop (md+)
- Table layout via MobileTableView's desktop mode
- Round headers span full width with border-bottom
- 32px between rounds provides clean visual separation

### Mobile (<md)
- Stacked card layout
- Cards have p-4 padding, space-y-3 between cards, space-y-2 internal
- All text has room to breathe; no truncation or overlap

## States
- **Populated (multiple rounds):** Normal flow with 32px between rounds
- **Populated (single round):** No inter-round spacing needed
- **Empty:** Handled by notFound() redirect (already implemented)

## Accessibility
- No accessibility changes needed; this is purely a spacing fix
- Existing semantic HTML structure preserved
