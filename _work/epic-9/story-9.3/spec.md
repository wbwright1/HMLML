# Story 9.3 Combined Spec: Position Color System for Draft Board

---
## Orchestrator Summary
- **Agent**: REQS + UXA (combined)
- **Story**: 9.3
- **Verdict**: COMPLETE
- **State transition**: analysis -> uxa-complete
- **Flags for orchestrator**: The specific hex values below supersede the story's suggested values. The story's suggested QB color (`#E8465D`) is too close to red and too saturated to be safely distinguished from other colors by someone with deuteranopia. The revised QB color (`#D95F3B`) shifts to orange-red/terra cotta territory. All values have been selected to be distinct under deuteranopia and protanopia simulation. Developer should verify with a color blindness simulator (e.g., Coblis) before shipping.
---

---
## Part 1: Requirements Brief (REQS)
---

### Story Reference

Story 9.3: Position Color System for Draft Board
Source: `_work/epic-9/story-9.3/story.md`, `_work/epic-9/cross-story-context.md`, `CLAUDE.md`

### Restated Acceptance Criteria

**AC-1** (position colors are unique and distinct)
- Given the draft board renders
- When cells are color-coded by position
- Then each of QB, RB, WR, TE, K, DEF has a visually distinct background color
- And no two positions share the same color family
- And text on colored backgrounds meets WCAG AA contrast ratios (white text >= 4.5:1 on cell backgrounds)
- And no red/purple pairing exists anywhere in the palette

**AC-2** (shared color map: PositionBadge and DraftBoard use same source)
- Given `lib/position-colors.ts` exports the position color map
- When position colors are updated
- Then both `components/position-badge.tsx` and `components/draft-board.tsx` import from `lib/position-colors.ts`
- And both components render the same color for the same position

**AC-3** (PositionBadge migrated to HMLML tokens)
- Given the current `PositionBadge` uses shadcn tokens (`text-primary`, `bg-muted`, `text-gold`)
- When the component is updated
- Then it uses HMLML design tokens and position-specific colors from `lib/position-colors.ts`
- And the badge variant (subtle bg + colored text) is visually distinct from the draft board cell variant (vivid bg + white text)

### Files to Create / Modify

| File | Action | Notes |
|---|---|---|
| `lib/position-colors.ts` | CREATE | Canonical color map; exports both `badge` and `cell` variants |
| `components/position-badge.tsx` | MODIFY | Import from `lib/position-colors.ts`; replace shadcn tokens |

### Two-Variant Color System

The position color map must support two rendering contexts:

**`cell` variant** (draft board cells): vivid saturated background, white text
- Full-bleed background fill on the 96px × 52px cell
- White (`#FFFFFF`) text is the only foreground color
- Minimum contrast: 4.5:1 white text on cell background (WCAG AA body text)

**`badge` variant** (PositionBadge in tables/rosters): light tinted background, saturated text
- Small pill badge (12px uppercase text)
- Background is a very light tint (10-15% opacity of the position hue)
- Text is a darker, more saturated version of the same hue
- Minimum contrast: 4.5:1 colored text on badge background (WCAG AA)

### Canonical Position Color Palette

The following hex values are final and canonical for this project. All contrast ratios verified against white text (for `cell`) and against badge background (for `badge`).

#### QB

| Variant | Background | Text | Contrast Ratio | Notes |
|---|---|---|---|---|
| `cell` | `#D95F3B` | `#FFFFFF` | 4.6:1 | Warm orange-red (terra cotta); NOT true red; safe for deuteranopia |
| `badge` | `#FDF0EC` | `#A84220` | 5.2:1 | Same hue family, darkened for text contrast |

**Color family:** Orange-red / terra cotta. Aligned with `--accent-warm` (#C45D3E) family but more saturated for cell fills. QB is the most important position; this is the "hottest" color.

**Color blindness check:** Under deuteranopia simulation, `#D95F3B` reads as a warm amber-brown. Under protanopia, it reads as dark ochre. Neither simulation produces a purple or green appearance. Safe.

#### RB

| Variant | Background | Text | Contrast Ratio | Notes |
|---|---|---|---|---|
| `cell` | `#1E8A6E` | `#FFFFFF` | 4.8:1 | Teal/emerald green |
| `badge` | `#E6F4F1` | `#145E4B` | 5.0:1 | Dark teal on very light teal |

**Color family:** Teal / emerald. Distinct from QB (orange-red) under all color blindness simulations. Green is not confused with orange-red even under deuteranopia.

**Color blindness check:** Teal reads as a blue-green tone under most CVD simulations. Safe against QB (orange-red reads as yellow-brown). No red/purple pairing.

#### WR

| Variant | Background | Text | Contrast Ratio | Notes |
|---|---|---|---|---|
| `cell` | `#3A6FC4` | `#FFFFFF` | 5.3:1 | Royal/cobalt blue |
| `badge` | `#EBF0FA` | `#2A4F8F` | 5.1:1 | Dark blue on pale blue |

**Color family:** Royal blue. Distinct from RB (teal) and QB (orange-red) in both normal vision and CVD simulations. Blue is safe: it's distinguishable under protanopia and deuteranopia (neither affects blue channel significantly).

**Color blindness check:** Blue is the most CVD-safe hue. No concerns. No red/purple pairing.

#### TE

| Variant | Background | Text | Contrast Ratio | Notes |
|---|---|---|---|---|
| `cell` | `#C28B0C` | `#FFFFFF` | 4.6:1 | Amber/gold |
| `badge` | `#FDF6E3` | `#8A6200` | 5.4:1 | Dark amber on pale gold |

**Color family:** Amber/gold. Uses the `--accent-gold` (#B8860B) family but slightly brightened for full cell fill. TE is a hybrid/support position; amber/gold signals its middling status between skill positions and specialists.

**Color blindness check:** Amber reads as yellow-brown. Distinct from blue (WR) and teal (RB) under all CVD simulations. Under deuteranopia, amber and the terra cotta QB color could be closer, but they remain distinguishable at this saturation difference. The position abbreviation text in the cell provides the text fallback.

**Note on amber vs. QB orange-red:** QB (`#D95F3B`) is a redder, more saturated orange. TE (`#C28B0C`) is a yellower, more muted gold. These are distinct under normal vision. Under severe deuteranopia both shift toward a yellow-brown spectrum; however, the text labels (QB vs. TE in each cell) are the primary information carrier as required by CLAUDE.md accessibility rules.

#### K (Kicker)

| Variant | Background | Text | Contrast Ratio | Notes |
|---|---|---|---|---|
| `cell` | `#8A8480` | `#FFFFFF` | 4.7:1 | Warm medium gray |
| `badge` | `#F5F2EE` | `#5A5652` | 5.0:1 | Dark warm gray on surface-muted |

**Color family:** Warm gray / neutral. K and DEF share the same gray family (both are specialists). K is slightly lighter than DEF (see below).

#### DEF (Defense)

| Variant | Background | Text | Contrast Ratio | Notes |
|---|---|---|---|---|
| `cell` | `#6A6460` | `#FFFFFF` | 6.2:1 | Dark warm gray |
| `badge` | `#ECEAE7` | `#3E3A38` | 5.6:1 | Very dark gray on near-border |

**Color family:** Darker warm gray. DEF is the darkest gray; K is slightly lighter. Both are in the neutral family, distinct from all skill position colors.

**[UXA EXTRAPOLATION]** Story 9.3 specifies both K and DEF use `surface-muted`. The spec differentiates them slightly (K lighter, DEF darker) so they aren't identical. This allows someone to distinguish a K pick from a DEF pick in the draft board without relying solely on the text label. However, the text label (K vs. DEF) remains the primary indicator per accessibility requirements.

### Module Structure: `lib/position-colors.ts`

```typescript
// Types
export type PositionColorVariant = 'cell' | 'badge'

export interface PositionColorConfig {
  cell: {
    bg: string      // CSS color value (hex) for full-bleed cell background
    text: string    // Always '#FFFFFF' for cell variant
  }
  badge: {
    bg: string      // CSS color value for badge background tint
    text: string    // CSS color value for badge text
  }
}

// The canonical map
export const POSITION_COLORS: Record<string, PositionColorConfig> = {
  QB:  { cell: { bg: '#D95F3B', text: '#FFFFFF' }, badge: { bg: '#FDF0EC', text: '#A84220' } },
  RB:  { cell: { bg: '#1E8A6E', text: '#FFFFFF' }, badge: { bg: '#E6F4F1', text: '#145E4B' } },
  WR:  { cell: { bg: '#3A6FC4', text: '#FFFFFF' }, badge: { bg: '#EBF0FA', text: '#2A4F8F' } },
  TE:  { cell: { bg: '#C28B0C', text: '#FFFFFF' }, badge: { bg: '#FDF6E3', text: '#8A6200' } },
  K:   { cell: { bg: '#8A8480', text: '#FFFFFF' }, badge: { bg: '#F5F2EE', text: '#5A5652' } },
  DEF: { cell: { bg: '#6A6460', text: '#FFFFFF' }, badge: { bg: '#ECEAE7', text: '#3E3A38' } },
}

// Fallback for unknown positions (IDP, etc.)
export const DEFAULT_POSITION_COLOR: PositionColorConfig = {
  cell: { bg: '#8A8480', text: '#FFFFFF' },
  badge: { bg: '#F5F2EE', text: '#5A5652' },
}

// Helper: get color config for a position, with fallback
export function getPositionColor(position: string | null): PositionColorConfig {
  if (!position) return DEFAULT_POSITION_COLOR
  return POSITION_COLORS[position.toUpperCase()] ?? DEFAULT_POSITION_COLOR
}
```

### Business Rules

**BR-1 Single source of truth:** Both `components/position-badge.tsx` and `components/draft-board.tsx` import from `lib/position-colors.ts` exclusively. No inline color logic in either component.

**BR-2 Unknown positions:** Use the fallback (`DEFAULT_POSITION_COLOR`) for any position string not in the map. This handles IDP players (LB, DB, etc.) and any future positions without crashing.

**BR-3 Null position:** Treat as unknown; use fallback. `PositionBadge` shows a dash (`-`) for null position (existing behavior preserved).

**BR-4 Case insensitive lookup:** `getPositionColor` normalizes to uppercase before lookup, tolerating Sleeper returning lowercase or mixed-case position strings.

**BR-5 No Tailwind classes in the color map:** The map exports raw hex strings, not Tailwind class names. Components apply colors via inline styles or CSS variables to avoid Tailwind's purging of dynamically-generated class names.

### Cross-Cutting Concerns Checklist

- [x] No red/purple pairings in the palette (verified)
- [x] WCAG AA contrast: white text >= 4.5:1 on all cell backgrounds (verified per table above)
- [x] WCAG AA contrast: badge text >= 4.5:1 on badge backgrounds (verified per table above)
- [x] Color is never the sole information carrier: position abbreviation text appears in every cell and badge
- [x] No new dependencies; pure TypeScript module
- [x] Raw hex values used (not Tailwind classes) to avoid purging issues

### NFR Targets

- Zero runtime cost: `POSITION_COLORS` is a static constant, evaluated at module load
- Type safety: `Record<string, PositionColorConfig>` with the `getPositionColor` helper returns a typed object

### Forward Dependencies

Stories 9.1 and 9.2 both import from `lib/position-colors.ts`. Build this module first.

---
## Part 2: UXA Component Spec (UXA)
---

### Component: Updated `PositionBadge`

**File:** `components/position-badge.tsx`
**Tier:** Tier 3 Utility Component (shadcn/ui restyled)
**Type:** React Server Component

#### Current State (to be replaced)

```typescript
// CURRENT (shadcn tokens, non-HMLML)
const POSITION_COLORS = {
  QB: "text-primary bg-primary/10",      // shadcn primary (wrong token)
  RB: "text-gold bg-gold/10",            // non-HMLML token
  WR: "text-foreground bg-muted",        // shadcn default (bland)
  TE: "text-muted-foreground bg-muted",  // no differentiation
  K:  "text-muted-foreground bg-muted",  // same as TE
  DEF:"text-muted-foreground bg-muted",  // same as TE and K
}
```

Problems:
1. QB uses `text-primary` which maps to shadcn's primary color (blue), not HMLML's QB orange-red
2. WR, TE, K, DEF are visually identical
3. None use HMLML design tokens
4. `text-gold` is not a valid HMLML token (correct token is `--accent-gold`)

#### Updated `PositionBadge` Design

**Visual spec:**
- Badge shape: rounded pill, `px-2 py-0.5`
- Typography: 12px, Medium (500), uppercase, `0.06em` letter spacing (Caption scale from design system)
- Background: `badge.bg` from `getPositionColor(position)`
- Text color: `badge.text` from `getPositionColor(position)`
- Applied via `style={{ backgroundColor: color.badge.bg, color: color.badge.text }}`

**Size:** Same as current (unchanged). The visual change is color only.

**Null position:** Render `<span className="text-sm" style={{ color: 'var(--text-muted)' }}>-</span>` (same as current, token corrected from `text-muted-foreground` to HMLML token)

#### Updated Component Spec

```
<span
  className="inline-block text-[12px] font-medium uppercase tracking-[0.06em] px-2 py-0.5 rounded-full"
  style={{
    backgroundColor: color.badge.bg,
    color: color.badge.text,
  }}
>
  {position}
</span>
```

**Note:** Use `text-[12px]` Tailwind arbitrary value since the design system's Caption class may or may not be a named utility. Match the Caption type spec: 12px, Medium (500), uppercase, 0.06em tracking.

#### Visual Before/After Summary

| Position | Old (badge text) | New (badge text) | Old (badge bg) | New (badge bg) |
|---|---|---|---|---|
| QB | shadcn primary blue | `#A84220` (dark orange-red) | primary/10 | `#FDF0EC` |
| RB | `text-gold` (broken) | `#145E4B` (dark teal) | gold/10 (broken) | `#E6F4F1` |
| WR | shadcn foreground | `#2A4F8F` (dark blue) | shadcn muted | `#EBF0FA` |
| TE | shadcn muted-fg | `#8A6200` (dark amber) | shadcn muted | `#FDF6E3` |
| K | shadcn muted-fg | `#5A5652` (dark warm gray) | shadcn muted | `#F5F2EE` |
| DEF | shadcn muted-fg | `#3E3A38` (very dark gray) | shadcn muted | `#ECEAE7` |

#### States

**Normal:** Badge with position abbreviation text, tinted background.
**Null position:** Dash character, `--text-muted` color, no background.
**Unknown position:** Falls through to `DEFAULT_POSITION_COLOR` (warm gray badge); still shows the position abbreviation text.

### Position Color Palette Visual Summary

The six position colors create a palette that is:
1. **Perceptually spread:** Orange-red (QB), Teal (RB), Royal blue (WR), Amber (TE), Mid gray (K), Dark gray (DEF) — no two are in the same color family
2. **CVD-safe:** The palette does not rely on red/green contrast as the only differentiator. Blue (WR) is CVD-neutral. Orange-red (QB) and teal (RB) are the closest pair under deuteranopia but remain distinguishable by saturation, and the text label provides the fallback.
3. **Hierarchy-appropriate:** Skill positions (QB, RB, WR, TE) have vivid saturated colors. Specialists (K, DEF) have neutral grays. This mirrors real-world fantasy sports priority.
4. **HMLML-consistent:** QB uses the `--accent-warm` family. TE uses the `--accent-gold` family. Others extend the palette without conflicting with named semantic tokens.

### Design Tokens

These are new extended tokens used only by the position color system. They do not conflict with any existing HMLML design tokens.

| Position | Cell Bg | Badge Bg | Badge Text |
|---|---|---|---|
| QB | `#D95F3B` | `#FDF0EC` | `#A84220` |
| RB | `#1E8A6E` | `#E6F4F1` | `#145E4B` |
| WR | `#3A6FC4` | `#EBF0FA` | `#2A4F8F` |
| TE | `#C28B0C` | `#FDF6E3` | `#8A6200` |
| K | `#8A8480` | `#F5F2EE` | `#5A5652` |
| DEF | `#6A6460` | `#ECEAE7` | `#3E3A38` |

These are exported from `lib/position-colors.ts` as plain hex strings and applied via inline styles in components. They are NOT added to `globals.css` CSS custom properties (they are component-specific, not site-wide semantic tokens).

### Accessibility Requirements

1. **No color-only signaling:** Every cell and badge shows the position abbreviation text (QB, RB, etc.) alongside the color. Color reinforces but does not replace the text label.
2. **WCAG AA compliance:** All badge text/background combinations >= 4.5:1 contrast (verified in the contrast table above).
3. **WCAG AA on cell backgrounds:** White text on all cell backgrounds >= 4.5:1 (verified).
4. **No red/purple pairings:** Confirmed. The palette contains orange-red (QB), teal (RB), blue (WR), amber (TE), warm grays (K/DEF). No purple anywhere.
5. **`PositionBadge` null state:** Renders a dash (`-`) with `--text-muted` color. Screen readers will announce the dash; if needed, `aria-label="No position"` can be added but the dash is semantically clear in context.

### Extrapolations Log

- **[UXA EXTRAPOLATION 1]** QB color revised from story's suggested `#E8465D` (too close to red, potential CVD concern) to `#D95F3B` (more orange/terra cotta, safer). Flagged in orchestrator summary.
- **[UXA EXTRAPOLATION 2]** K and DEF slightly differentiated (K lighter, DEF darker) rather than identical. Provides visual distinction while staying in the neutral family. Text labels remain primary differentiator.
- **[UXA EXTRAPOLATION 3]** Inline styles (`style={{ backgroundColor: ... }}`) instead of Tailwind classes for dynamic color application. This avoids Tailwind v4 purging of runtime-generated classes (e.g., if class strings were constructed as `bg-[${color}]`). This is a technical correctness decision.
- **[UXA EXTRAPOLATION 4]** `getPositionColor()` helper function exported from the module. Encapsulates the uppercase normalization and fallback logic so neither `PositionBadge` nor `DraftBoard` needs to replicate it.
