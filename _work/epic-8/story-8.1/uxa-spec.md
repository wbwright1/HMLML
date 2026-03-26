---
## Orchestrator Summary
- **Agent**: UXA
- **Story**: 8.1 - Tone Down Team Award Stats & Add Icons
- **Verdict**: COMPLETE
- **State transition**: reqs-complete -> uxa-complete
- **Flags for orchestrator**: None
---

# UXA Component & Interaction Spec: Story 8.1

## Components Affected

### 1. TeamAwardCard (`components/team-award-card.tsx`)

**Stat Size Change:**
- Current: `text-display` (56-64px, Black 900) on the stat value
- New: `text-h2` (28-32px, Bold 700) on the stat value
- Keep `tabular-nums` and `text-text-primary`

**Icon Addition:**
- Place icon inline-left of the label text in the caption row
- Layout: `<div className="flex items-center gap-1.5">` wrapping icon + label
- Icon size: 16px (w-4 h-4)
- Icon color: inherits from `labelStyles[tone]` (same color as label text)
- Icon opacity: full opacity (matches label)
- Icons are decorative: `aria-hidden="true"` on each SVG

**Visual Result:**
```
[icon] POINT MACHINE          <- caption row with icon
1,847.3                        <- text-h2 (was text-display)
Most regular season points     <- context
Team Name                      <- franchise name
```

### 2. StingCard (`components/sting-card.tsx`)

**Icon Addition:**
- Same pattern: icon inline-left of label in caption row
- Wrap label in flex container: `<div className="flex items-center gap-1.5">`
- Icon size: 16px (w-4 h-4)
- Icon color: `text-accent-warm` (matching label)
- `aria-hidden="true"`

**No stat size change needed** (already uses `text-h3` which is appropriate).

### 3. PlayerAwardCard (`components/player-award-card.tsx`)

**Icon Addition:**
- Same pattern: icon inline-left of the award label
- Icon size: 16px (w-4 h-4)
- Icon color: `text-accent-gold` (matching tone)
- `aria-hidden="true"`

## Icon Map Specification

### Location: `lib/award-icons.tsx` (new file)

### Export: `getAwardIcon(label: string): React.ReactNode | null`

### Icon Style:
- All SVGs use a consistent outline/stroke style (1.5px stroke, no fill)
- ViewBox: `0 0 16 16`
- Use `currentColor` for stroke so icons inherit text color
- Simple, universally recognizable symbols

### Icon Assignments:

| Label | Icon | Description |
|-------|------|-------------|
| "Point Machine" | Target/crosshair | Concentric circles with crosshair |
| "Iron Curtain" | Shield | Simple shield outline |
| "Regular Season King" | Crown | Three-point crown |
| "League Doormat" | Down arrow/floor | Arrow pointing down |
| "Glass Cannon" | Lightning bolt | Zigzag bolt |
| "Punching Bag" | Boxing glove | Simple glove outline |
| "Coaching Malpractice" | Clipboard with X | Clipboard with X mark |
| "BEST QB" | Football | American football outline |
| "BEST RB" | Running figure | Simplified runner |
| "BEST WR" | Hands/catch | Open hands |
| "BEST TE" | Star | Five-point star |

### Fallback:
If `label` doesn't match any key, return `null`. Components render no icon in this case (current behavior).

### Matching Strategy:
Case-insensitive substring match against the label. This handles variations like "Paper Tiger" vs "Punching Bag" by matching on key words.

## Layout & Responsive Behavior

### Desktop (md+)
- No change to card grid layout (2-col grid managed by hub page)
- Stat size reduction from display to h2 will make cards more compact vertically
- Icons at 16px sit naturally next to 12px uppercase caption text

### Mobile (<md)
- Single column layout (managed by hub page)
- Icons remain 16px; flex gap-1.5 ensures no crowding
- No special mobile treatment needed

## States
- **Populated:** Icon + label + stat + context + franchise name (normal)
- **Missing icon:** Label renders without icon (graceful fallback)
- **Empty stat:** N/A (stats always provided by query)

## Accessibility
- All icons: `aria-hidden="true"` (decorative; label text conveys meaning)
- No color-only information (icons supplement text labels)
- Label text remains the accessible name for the card content
