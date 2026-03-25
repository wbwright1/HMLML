---
status: draft
createdAt: '2026-03-25'
parentSpec: 'ux-design-specification.md'
scope: visual-polish
tiers: 6
---

# UX Polish Specification — HML Website

**Author:** Blake
**Date:** 2026-03-25
**Parent:** [UX Design Specification](./ux-design-specification.md)

---

## Purpose

This document defines targeted visual polish and consistency improvements to the existing HML website. The site's feature set and information architecture are complete — this work focuses on closing the gap between the original UX design specification's vision and the current implementation, with emphasis on the homepage experience, visual consistency, and franchise identity.

No new features. No new pages. No new data requirements. Just making what exists feel finished.

---

## Tier 1: Homepage Redesign — League Hub

### Problem

The current homepage shows a title, one featured stat, top-5 matchups, and standings. It functions as a data summary, not a league hub. The original UX spec envisioned a "Living Dashboard" that surfaces content worth sharing and gives members a reason to visit even without a specific question. That vision wasn't fully realized.

### Changes

#### 1.1 — League Identity Hero

Replace the current plain text hero with a visual identity section:

- **League crest/banner area** — A styled header zone with the league name in Display weight, the "Est. 2017" badge, and a one-line league tagline (e.g., "12 Teams. Dynasty Format. Harambe's Legacy.")
- **Current season context** — Below the tagline, show the current season year and week in Body Small (e.g., "2025 Season — Week 11")
- **Visual treatment** — Subtle background tint using the primary forest green at ~3-5% opacity to distinguish the hero from the rest of the page. No images or illustrations required — typography and spacing carry the personality

#### 1.2 — Superlative Row (Multi-Stat Dashboard)

Replace the single StatHero with a row of 3-4 rotating league superlatives:

- **Desktop:** Horizontal row of StatHero components at `md` size (36-40px numbers)
- **Mobile:** Horizontally scrollable row or 2x2 grid
- **Example stats to surface:**
  - Highest score this week (or last completed week)
  - Longest active win streak
  - Closest matchup this week (margin)
  - Most all-time wins (career superlative)
- **Data source:** Server-rendered from existing queries. No new API calls needed — these are derivable from `franchise_seasons`, `matchups`, and existing standings data
- **Rotation:** Static per page load (server-selected). No client-side carousel or animation. Content varies because the data changes weekly during the season

#### 1.3 — This Week's Matchups (Full, Not Top 5)

- Show **all matchups** for the current week on the homepage, not just the top 5
- For a 12-team league, that's 6 matchups — a manageable list
- Remove the "View all matchups" link (it's all here now)
- Keep the ScorePoller integration for live game windows
- Add a section header: "Week N Matchups" with the week number dynamic

#### 1.4 — Standings with Personality

Enhance the current standings section:

- Add `SuperlativeBadge` inline on the standings leader (e.g., "1st Place" gold badge on the top team)
- Bold the top team's record as a visual anchor
- On franchise rows, integrate the franchise's `brandingColor` as a subtle left border accent (2-3px) — this previews Tier 2's franchise color work
- Keep the existing desktop table / mobile card dual layout

#### 1.5 — Season Narrative Block (Optional — Offseason vs In-Season)

Add a contextual section between the superlative row and matchups:

- **In-season:** "Last Week's Results" — a compact summary of completed matchups (winners in bold, scores, biggest blowout callout)
- **Offseason:** "League at a Glance" — reigning champion with ChampionshipStars, total seasons played, total matchups played, most championships franchise
- This section uses the same editorial scroll rhythm — PageSection with label, title, and content

---

## Tier 2: Franchise Color Integration

### Problem

Every franchise has a `brandingColor` stored in the database, but it's only used for the logo initial fallback background. The original spec envisioned franchise colors as part of visual identity across the site. The site currently feels colorless outside of the forest green accent.

### Changes

#### 2.1 — Matchup Row Team Accents

- Add a thin vertical bar (3px) in each team's `brandingColor` on their side of the MatchupRow
- Left team gets a left-edge accent; right team gets a right-edge accent
- The bar is decorative — no information conveyed by color alone (team names and scores are the primary identifiers)

#### 2.2 — Franchise Cards on Teams Page

- On the all-franchises grid, each franchise card gets a top border (3px) in `brandingColor`
- This creates visual variety in the grid and makes each franchise feel distinct

#### 2.3 — Franchise Page Hero

- The franchise detail page hero section gets a subtle background gradient using `brandingColor` at 5-8% opacity
- This creates a "team homepage" feel without overwhelming the content
- The gradient fades to transparent below the hero so the rest of the page remains on the standard background

#### 2.4 — Standings Left Border

- In standings tables (homepage and dedicated standings), each franchise row gets a 2-3px left border in `brandingColor`
- Creates a color-coded roster at a glance while maintaining the clean table layout

#### 2.5 — Implementation Notes

- All franchise color usage is **decorative** — never the sole way to identify a team
- Colors are applied via inline `style={{ borderColor: franchise.brandingColor }}` since they're dynamic per-franchise and can't be predefined in CSS variables
- Ensure sufficient contrast: franchise colors only appear as borders/accents on white/cream backgrounds, never as text colors or full backgrounds
- If a franchise has no `brandingColor`, fall back to the muted border color (`var(--border)`)

---

## Tier 3: Visual Consistency Cleanup

### Problem

The implementation drifted from the spec's "never hardcoded hex values" rule. Colors are defined in CSS variables in `globals.css` but several components use hardcoded hex values in inline styles. There are also multiple badge/styling approaches that should be unified.

### Changes

#### 3.1 — Migrate SuperlativeBadge to Tailwind Classes

The SuperlativeBadge component currently uses inline `style` objects for all styling. Migrate to Tailwind utility classes:

**Current (inline styles):**
```typescript
const variantStyles = {
  gold: { backgroundColor: "rgba(184, 134, 11, 0.1)", color: "#B8860B" },
  green: { backgroundColor: "rgba(45, 90, 61, 0.1)", color: "#2D5A3D" },
  neutral: { backgroundColor: "#F0ECE8", color: "#6B6560" },
  // ...
};
```

**Target (Tailwind classes):**
```typescript
const variantClasses = {
  gold: "bg-gold/10 text-gold",
  green: "bg-primary/10 text-primary",
  neutral: "bg-muted text-muted-foreground",
  silver: "bg-blue-800/15 text-blue-800",
  brown: "bg-amber-800/10 text-amber-800",
};
```

Base classes: `inline-block text-caption uppercase tracking-wide font-medium rounded-full px-2 py-0.5`

#### 3.2 — Eliminate Hardcoded Hex Colors

Migrate all inline hex colors to CSS variable references or Tailwind classes:

| File | Current | Target |
|---|---|---|
| `h2h-hero.tsx` | `color: "#2D5A3D"` / `"#C4402F"` | `text-primary` / `text-destructive` (add `--destructive` for loss color if not already a warm red) |
| `records/head-to-head/page.tsx` | `color: "#6B6560"` | `text-muted-foreground` |
| `records/head-to-head/page.tsx` | `color: "#2D5A3D"` / `"#C4402F"` | `text-primary` / `text-destructive` |
| `players/player-table.tsx` | Multiple hardcoded hex values for filter buttons | Tailwind classes using `bg-primary`, `text-primary-foreground`, `bg-muted`, `text-muted-foreground` |
| `seasons/page.tsx` | `color: "#2D5A3D"` on status badge | Use `SuperlativeBadge` component with `green` variant |
| `franchise-logo.tsx` | `#6B6560` fallback | `var(--muted-foreground)` |
| `franchise-selector.tsx` | `#6B6560` on chevron icon | `text-muted-foreground` class |

#### 3.3 — Add Missing CSS Variable for Loss/Negative Color

The H2H pages use `#C4402F` (a warm red) for the losing side of records. This color isn't in the design token system. Add it:

```css
--loss: #C4402F;
```

Reference as `text-loss` in components. This color is always paired with a label ("L", score context) — never used alone to convey meaning, maintaining accessibility compliance.

#### 3.4 — Unify Status Badge Patterns

The seasons page creates inline status badges with hardcoded styles. The players page creates filter buttons with hardcoded styles. Both should use the existing component system:

- Seasons page "Complete" badge → use `SuperlativeBadge` with `green` variant
- Player position filters → create a `FilterPill` component or use Tailwind classes referencing design tokens (not a new component if it's only used once — just replace the inline styles with Tailwind classes)

#### 3.5 — Live Indicator Color

The `LiveIndicator` or score-poller uses Tailwind's built-in `green-500`/`green-600` for the pulsing dot. This should use `var(--primary)` (forest green) to stay consistent with the brand:

- Replace `bg-green-500` / `bg-green-600` with `bg-primary`
- The "Live" text label should use `text-primary`

#### 3.6 — Button / Link Hierarchy

Establish a clear visual hierarchy for interactive elements:

- **Primary action links** (navigation, "View all"): `text-primary font-medium hover:underline`
- **Secondary action links** (breadcrumbs, contextual): `text-muted-foreground hover:text-foreground`
- **Card/row links** (franchise names in tables, season years): `text-primary hover:underline`
- Document this in a comment block at the top of `globals.css` for developer reference

---

## Tier 4: Empty State Improvements

### Problem

All empty states are plain text paragraphs. The original spec says "never show a blank page" and calls for a consistent message format. The current messages are informational but visually flat — they don't match the premium feel of the rest of the site.

### Changes

#### 4.1 — Empty State Component

Create a reusable `EmptyState` component:

```
Anatomy: Icon (optional) → Title (H3) → Description (Body, muted) → Action link (optional)
```

- Centered on page, max-width 400px
- Generous vertical padding (spacing-2xl top and bottom)
- Icon: a subtle, muted SVG — not decorative illustration, just a contextual icon (e.g., calendar for "no seasons", users for "no franchises", search for "no results")
- Use Lucide React icons (already in the project) at 48px, `text-muted-foreground/50` opacity

#### 4.2 — Page-Specific Empty States

| Page | Title | Description | Action |
|---|---|---|---|
| Homepage (no data) | "Syncing League Data" | "We're pulling data from Sleeper. Standings, matchups, and history will appear here once the first sync completes." | None |
| Matchups (no data) | "No Matchups Yet" | "Matchup data will appear once the season begins and scores sync from Sleeper." | "Browse league history" → `/seasons` |
| Teams (no data) | "Loading Franchises" | "Franchise data is syncing from Sleeper. Check back shortly." | None |
| Seasons (no data) | "No Seasons Yet" | "Season history will appear after the first data sync completes." | None |
| H2H (no data) | "Select Two Franchises" | "Choose two franchises above to see their head-to-head history." | None |
| Player search (no results) | "No Players Found" | "No players match '[query]'. Check the spelling or try a different name." | None |
| Error page | "Something Went Wrong" | "Data is temporarily unavailable. This may be a sync issue — try refreshing in a moment." | "Go home" → `/` |

---

## Tier 5: Championship & Trophy Visual Upgrade

### Problem

Championships are currently indicated by star characters (★) rendered as inline text. The original spec calls for gold star icons that feel "premium" and create a "that's sick" moment for multi-championship franchises. The current implementation is functional but doesn't land visually.

### Changes

#### 5.1 — ChampionshipStars Component Upgrade

Replace text star characters with proper SVG star icons:

- Use Lucide React's `Star` icon (already in the project) with `fill="currentColor"` for solid gold stars
- Color: `var(--gold)` (#B8860B)
- Sizes: `inline` variant = 14px, `hero` variant = 20px
- Add a subtle drop shadow or slight scale on the hero variant to give depth
- Zero championships: render nothing (unchanged)
- Accessibility: `aria-label="{count} championship{s}"` (unchanged)

#### 5.2 — Trophy Case Enhancement (Records Page)

If the records page has a trophy case section:

- Each championship entry should show: Season year, champion franchise with FranchiseIdentity, gold SuperlativeBadge "League Champion"
- The most recent champion gets a slightly larger treatment (StatHero `lg` with the season year)
- Historical champions listed chronologically below

#### 5.3 — Champion Highlight on Season Pages

On individual season detail pages, the champion section should:

- Use a gold-tinted background (gold at 5% opacity) instead of the current light primary background
- Display the ChampionshipStars (hero variant) next to the champion name
- Add a `SuperlativeBadge` with `gold` variant: "League Champion"

---

## Tier 6: Responsive Edge-Case Fixes

### Problem

The responsive design is solid overall, but there are specific breakpoints and components that don't transition smoothly, particularly at tablet widths and with data-heavy components.

### Changes

#### 6.1 — Power Rankings Horizontal Layout

The records/power-rankings section uses a horizontal layout that doesn't fully adapt on tablets:

- At `md` breakpoint (768px): ensure the layout stacks or wraps gracefully
- If using a flex row, add `flex-wrap` so items wrap to new lines rather than overflowing
- Test at exactly 768px and 1024px widths

#### 6.2 — Stat Display Wrapping

Some stat display components may wrap awkwardly at mid-range tablet widths (800-1000px):

- The superlative row (Tier 1.2) should use a responsive grid: `grid-cols-2` on mobile, `grid-cols-4` on desktop, with `gap-4`
- StatHero components should have a minimum width to prevent text compression

#### 6.3 — Mobile Table Card View Consistency

Audit all MobileTableView usages to ensure:

- Card layout activates consistently at the same breakpoint (`md` / 768px)
- All card layouts show the same visual pattern: franchise identity left, key stat right
- No table shows more than 4 columns on mobile without converting to cards

#### 6.4 — Season Selector Overflow

The SeasonSelector component with many years (8+ seasons) may overflow on mobile:

- Ensure horizontal scroll is smooth with `-webkit-overflow-scrolling: touch`
- Add subtle fade/gradient indicators on left/right edges when content overflows to signal scrollability
- Active season should auto-scroll into view on page load

#### 6.5 — Bottom Tab Bar Safe Area

Verify the bottom tab bar handles safe-area-inset-bottom correctly on all notched devices:

- Use `pb-[env(safe-area-inset-bottom)]` on the tab bar container
- Ensure the main content's `pb-20 md:pb-0` accounts for the tab bar height plus safe area

---

## Implementation Priority

| Order | Tier | Scope | Rationale |
|---|---|---|---|
| 1 | Tier 3 | Visual consistency cleanup | Foundation work — fixes design debt that other tiers build on |
| 2 | Tier 1 | Homepage redesign | Highest user-facing impact; makes the site feel alive |
| 3 | Tier 2 | Franchise color integration | Visual personality boost; builds on Tier 3's clean token system |
| 4 | Tier 5 | Championship/trophy upgrade | Small scope, high delight impact |
| 5 | Tier 4 | Empty state improvements | Polish for edge cases most users rarely see |
| 6 | Tier 6 | Responsive fixes | Targeted fixes for specific breakpoints |

---

## Tier 7: Co-Owner Display

### Problem

Some franchises have co-owners (notably "Bucky's General Store" and potentially others). The Sleeper API provides a `co_owners` array on roster objects, but the current schema only stores a single `ownerDisplayName` per franchise-season. Co-owners are invisible on the site.

### Changes

#### 7.1 — Schema Addition

Add a `coOwnerDisplayName` field to the `franchise_seasons` table:

```typescript
coOwnerDisplayName: text("co_owner_display_name"),
```

This is a nullable text field. Most franchise-seasons will have `null`. Generate and run a Drizzle migration.

#### 7.2 — Sync Update

Update the daily sync and legacy import logic to capture co-owner data from Sleeper:

- The Sleeper roster object includes a `co_owners` array of user IDs
- For each co-owner user ID, resolve the display name from the users endpoint
- Store as the `coOwnerDisplayName` value (if multiple co-owners, join with " & ")
- Only the first co-owner needs display — Sleeper rarely has more than one

#### 7.3 — FranchiseIdentity Component Update

Update the `FranchiseIdentity` component to accept and display co-owners:

- Add `coOwnerName?: string` prop
- **Hero variant:** "Owned by {ownerName} & {coOwnerName}" (when co-owner exists)
- **Standard variant:** Show combined owner text in the caption line
- **Compact variant:** No change (doesn't show owner names)

#### 7.4 — Display Across Pages

Everywhere `ownerDisplayName` is currently shown, also show `coOwnerDisplayName` when present:

- **Homepage standings** (mobile cards and desktop table): "Owner & Co-Owner"
- **Franchise detail page** hero section: "Owned by X & Y"
- **Franchise detail page** season history cards: show co-owner per season where applicable
- **Teams overview page**: owner line includes co-owner

#### 7.5 — Formatting Rule

- When both owner and co-owner exist: "{owner} & {coOwner}"
- When only owner: "{owner}"
- When neither (edge case): omit the owner line entirely
- The " & " separator is consistent everywhere — no "and", no commas

---

## Implementation Priority

| Order | Tier | Scope | Rationale |
|---|---|---|---|
| 1 | Tier 3 | Visual consistency cleanup | Foundation work — fixes design debt that other tiers build on |
| 2 | Tier 7 | Co-owner display | Small schema change + sync update — best done early before UI work |
| 3 | Tier 1 | Homepage redesign | Highest user-facing impact; makes the site feel alive |
| 4 | Tier 2 | Franchise color integration | Visual personality boost; builds on Tier 3's clean token system |
| 5 | Tier 5 | Championship/trophy upgrade | Small scope, high delight impact |
| 6 | Tier 4 | Empty state improvements | Polish for edge cases most users rarely see |
| 7 | Tier 6 | Responsive fixes | Targeted fixes for specific breakpoints |

---

## Out of Scope

- New pages or routes
- New API endpoints (beyond sync updates for co-owners)
- Authentication or admin features
- Dark mode
- Animations beyond what the original spec already defines
- Third-party libraries or dependencies (use existing: Lucide icons, Tailwind, etc.)
