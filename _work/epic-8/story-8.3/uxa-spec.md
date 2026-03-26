---
## Orchestrator Summary
- **Agent**: UXA
- **Story**: 8.3 - Clean Up Records Leaderboard Table Styling
- **Verdict**: COMPLETE
- **State transition**: reqs-complete -> uxa-complete
- **Flags for orchestrator**: None. Strong opinionated recommendation below.
---

# UXA Component & Interaction Spec: Story 8.3

## Design Recommendation

**Remove the colored left border entirely.** Do not replace it with another branding color treatment on the row/card level. Here's why:

1. The `FranchiseIdentity` component already renders the team's branding color as a colored swatch/logo next to the name. Doubling this information on the row border is visual noise, not visual information.
2. A 3px left border on a data table rows is a UI pattern associated with status indicators (active state, selected row), not decoration. Using it for branding color creates false affordance.
3. The "Press Box Evolved" aesthetic is clean, institutional, and confident. Think Wall Street Journal tables, not ESPN.com. WSJ tables don't have colored row borders.

**The table should rely on:** clear typography hierarchy, consistent alignment, subtle row separation, and the FranchiseIdentity component for team branding.

## Desktop Table Specification

### Table Structure
```
#   Team                    W    L    Win%   PF      Titles
--- ---------------------- ---- ---- ------ ------- ------
 1  [color] Team Alpha      48   32   60.0%  4,521.3    2
 2  [color] Team Beta       45   35   56.3%  4,102.7    1
 ...
```

### Row Styling
- **Remove:** `style={{ borderLeft: '3px solid ...' }}` from all `<tr>` elements
- **Add:** `hover:bg-surface-muted` on each row for scanability on hover (150ms transition)
- **Keep:** `border-b border-border/50` between rows, `last:border-0` on last row
- **Add:** Alternating row backgrounds: even rows get `bg-surface-muted/30` for subtle zebra striping

### Header Row
- Border: `border-b border-border` (keep as-is)
- Active sort column: `text-text-primary font-semibold` (currently all headers use `text-text-tertiary`)
- Inactive headers: `text-text-tertiary font-medium`
- Hover on sortable headers: `hover:text-text-secondary` (subtle feedback)
- Add `scope="col"` to all `<th>` for accessibility

### Rank Column
- Top 3: `text-accent-gold font-bold` (was `text-gold`)
- Others: `text-text-tertiary font-bold`

### Stat Columns
- All stat values: `text-sm tabular-nums text-text-primary`
- Wins column: `font-bold` (as primary stat)
- Other columns: normal weight

## Mobile Card Specification

### Card Structure
- **Remove:** `borderLeftWidth: 3px` and `borderLeftColor` from card styles
- **Use:** Uniform `border border-border` on all cards
- **Background:** `bg-surface` (was `bg-card`)
- **Hover:** `hover:border-border-strong` (was `hover:bg-muted/50`)

### Branding Color in Mobile Cards
**Do not add a separate branding color indicator.** The `FranchiseIdentity` component already handles this inside the card. Adding a colored dot, bar, or accent is redundant and clutters the compact mobile layout.

### Rank in Mobile Cards
- Top 3: `text-accent-gold font-bold`
- Others: `text-text-tertiary font-bold`

### Stat Row in Mobile Cards
- Use `text-text-primary` for wins count
- Use `text-text-tertiary` for losses, win%, PF labels

## Token Replacement Map

| Current (shadcn) | New (HMLML) |
|---|---|
| `text-gold` | `text-accent-gold` |
| `text-muted-foreground` | `text-text-tertiary` |
| `text-foreground` | `text-text-primary` |
| `hover:text-foreground` | `hover:text-text-secondary` |
| `bg-card` | `bg-surface` |
| `hover:bg-muted/50` | `hover:border-border-strong` |

## Interaction Flows

### Sort Interaction
1. User clicks/taps sortable column header
2. If same column: toggle direction (desc/asc)
3. If different column: activate new column desc
4. Active column header: `text-text-primary font-semibold`
5. Sort indicator (triangle): same color as header text
6. Transition: none (instant state change; no animation per design system rules)

## Accessibility
- All `<th>` elements: add `scope="col"`
- Sort headers: maintain existing `role="button"` and `tabIndex={0}`
- Sort state: the `▼`/`▲` indicator provides visual feedback; also add `aria-sort="ascending"` or `aria-sort="descending"` to the active `<th>`
- Contrast: `text-accent-gold` (#B8860B) on white is ~3.5:1 at 14px bold. This passes WCAG AA for large text (14px bold qualifies). If auditing flags it, fall back to `text-text-primary` with a gold star prefix.
- No color-only information: rank number is always present as text

## States
- **Populated (all-time):** Full table with all franchises, default sort by wins desc
- **Populated (season):** Filtered to single season, same layout
- **Empty (no data for season):** EmptyState component renders (already handled)
- **Loading:** N/A (server-rendered)
- **Error:** N/A (server-rendered, query failures show empty state)
