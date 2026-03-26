---
## Orchestrator Summary
- **Agent**: UXA
- **Story**: 1.3 — Core Layout Components
- **Verdict**: COMPLETE
- **State transition**: reqs-complete -> uxa-complete
- **Key decisions recorded:**
  1. SiteNav architecture: split into `SiteNavServer` (RSC shell) + `SiteNavClient` (client island for hamburger state and active-link detection). The server component renders brand text and `SeasonalPillBadge`; the client island owns the nav links, open/close state, and pathname detection. This satisfies CLAUDE.md's RSC-by-default rule while keeping client JS minimal.
  2. BottomTabBar: confirmed for retirement. The hamburger menu is the replacement. Remove from `app/layout.tsx`.
  3. SeasonalPillBadge data fallback: render nothing (omit the element entirely) when the DB query returns null or throws. This is safer than showing "Offseason" which could be actively misleading. Until Epic 2 populates NFL state data, the badge simply will not appear.
  4. SyncTimestamp stale color: use `text-[#C4402F]` as the pre-1.2 fallback for stale state. Update once `--accent-warm` token is confirmed from Story 1.2. The color is explicitly not red or purple and passes WCAG AA against `--background` (#FAF8F5).
---

# UXA Spec: Story 1.3 — Core Layout Components

## Components

---

### 1. SiteNav — UPDATE

#### Architecture Decision

Split into two files:

- `components/site-nav-server.tsx` — React Server Component. Renders the `<header>` shell, brand text link, and `<SeasonalPillBadge />`. Passes the nav links config to the client island.
- `components/site-nav-client.tsx` — `"use client"`. Manages hamburger open/close state, reads `usePathname()` for active-link detection, renders the nav link list on desktop and the mobile overlay.

The `<SiteNav />` export in `components/site-nav.tsx` becomes a thin wrapper that renders `SiteNavServer` (which in turn renders `SiteNavClient` as a child). The existing `"use client"` directive on `site-nav.tsx` is removed.

`app/layout.tsx` continues to import `<SiteNav />` with no changes to the import call.

#### Structure

```
<header> — sticky top-0 z-40, full-width, border-b, bg-background/95 backdrop-blur-sm
  <nav aria-label="Main navigation"> — max-w-[1200px] mx-auto, h-14, flex items-center justify-between, px-6 lg:px-8
    [left] <Link href="/"> — brand text "HMLML"
    [center/right — desktop only, md:flex hidden] <ul> — nav links
    [right] <SeasonalPillBadge /> — always visible in bar
    [right — mobile only, md:hidden] <button> — hamburger toggle
  </nav>
  [mobile only] — overlay/dropdown nav (conditionally rendered when open)
```

#### Nav Links (Non-Negotiable Order)

| Label | href | Active Match Rule |
|---|---|---|
| Hub | `/` | `pathname === "/"` (exact match only) |
| Teams | `/teams` | `pathname === "/teams" \|\| pathname.startsWith("/teams/")` |
| Records | `/records` | `pathname === "/records" \|\| pathname.startsWith("/records/")` |
| History | `/seasons` | `pathname === "/seasons" \|\| pathname.startsWith("/seasons/")` |
| Drafts | `/drafts` | `pathname === "/drafts" \|\| pathname.startsWith("/drafts/")` |
| Players | `/players` | `pathname === "/players" \|\| pathname.startsWith("/players/")` |

Note: Hub uses exact `pathname === "/"` only. The `startsWith` pattern used for other routes would incorrectly match everything if applied to `/`.

#### Desktop Layout (md: 768px and above)

- Full horizontal nav bar, height `h-14` (56px)
- Brand "HMLML" at left: `text-lg font-bold text-primary`, links to `/`
- Nav links: `flex items-center gap-6` at center/right
- `SeasonalPillBadge` at far right, after the nav links
- Hamburger button: `md:hidden` (not rendered on desktop)
- Mobile overlay: not rendered on desktop

Active link state:
- Text color: `text-primary` (forest green)
- Underline: `underline underline-offset-4 decoration-primary`
- Font weight: `font-medium`
- `aria-current="page"` attribute set

Inactive link state:
- Text color: `text-muted-foreground`
- Font weight: `font-medium`
- Hover: `hover:text-foreground transition-colors` (150ms ease, per animation philosophy)

#### Mobile Layout (below md: < 768px)

**Top bar (always visible, fixed):**
- Position: `fixed top-0 inset-x-0 z-40`
- Height: `h-14` (56px)
- Background: `bg-background/95 backdrop-blur-sm border-b border-border`
- Left: brand "HMLML" link (`text-lg font-bold text-primary`)
- Right: `SeasonalPillBadge` (if rendered) + hamburger button
- `SeasonalPillBadge` and hamburger button are adjacent, `flex items-center gap-3`

**Hamburger button:**
- Size: minimum 44x44px tap target (use `p-2.5` padding with a 24x24px icon, or set explicit `min-w-[44px] min-h-[44px]` with `flex items-center justify-center`)
- Icon: three horizontal lines (standard hamburger icon) when closed; X icon when open
- Both icons: 20x20px (`size-5`), `aria-hidden="true"`
- Button closed state: `aria-label="Open navigation"`, `aria-expanded="false"`
- Button open state: `aria-label="Close navigation"`, `aria-expanded="true"`
- Focus state: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`
- No animation on icon transition (swap is immediate per animation philosophy — no spin, no morph)

**Mobile nav overlay (open state):**
- Renders below the fixed top bar, not full-screen overlay
- Position: `fixed top-14 inset-x-0 z-30` (sits directly beneath the bar)
- Background: `bg-background border-b border-border`
- Nav links: stacked vertically as a `<ul>` with `role="list"`
- Each link: full-width block, `py-3 px-6`, `text-base font-medium`
- Active link: `text-primary font-medium` with left border accent `border-l-2 border-primary pl-5` (the underline treatment doesn't work well on stacked vertical links; use left border indicator instead)
- Inactive link: `text-foreground`, `hover:bg-muted transition-colors`
- Minimum tap target: 44px height per link (py-3 with base text achieves ~48px)
- `aria-current="page"` on active link

**Focus trap in open overlay:**
- When the overlay opens, focus moves to the first nav link
- Tab key cycles through nav links only (trapped within the overlay)
- Shift+Tab wraps backward through the links
- When focus leaves the last item and Tab is pressed, focus cycles back to the first item (not to elements behind the overlay)
- Escape key closes the overlay and returns focus to the hamburger button
- Click outside the overlay (on the page content behind) closes the overlay

**Close triggers:**
- Escape key
- Click/tap outside the overlay
- Clicking a nav link (navigation occurs, overlay closes)
- Clicking the hamburger button again (X icon)

**`aria-controls`:** The hamburger button should have `aria-controls="mobile-nav-menu"` and the overlay `<ul>` or container should have `id="mobile-nav-menu"`.

#### Content Offset (layout.tsx)

The `<main>` element in `app/layout.tsx` must have `pt-14 md:pt-0` to offset the fixed mobile nav bar. On desktop (`md:` and up), the nav is `sticky` (not fixed) so no offset padding is needed. The existing `pb-20 md:pb-0` bottom padding (for BottomTabBar clearance) is removed.

Updated `<main>` class: `id="main-content" className="pt-14 md:pt-0"`

#### Variants and States

| State | Behavior |
|---|---|
| Default (desktop) | Full horizontal bar visible |
| Default (mobile) | Slim fixed bar, hamburger visible, overlay hidden |
| Mobile nav open | Overlay renders below bar, hamburger shows X icon, focus trapped |
| Active page | Link highlighted with primary color + underline (desktop) or left border (mobile) |
| No active match | All links in muted state (should not occur normally) |

---

### 2. SeasonalPillBadge — NEW

#### Component Type
Async React Server Component (no client directive). Reads from DB via Drizzle query. Returns `null` when data is unavailable.

#### File
`components/seasonal-pill-badge.tsx`

#### Props
None. The component is self-contained and fetches its own data.

#### Data Source
Query the DB for the current NFL state. The query should look in `lib/queries/` for an existing function that returns current season type and week number. If no such function exists, create a minimal one in `lib/queries/seasons.ts` (or the most appropriate existing query file). The query should return `{ seasonType: string, week: number } | null`.

If the query returns `null` or throws, the component returns `null` (renders nothing). No error boundary needed here; graceful degradation is correct behavior.

**Hardcode note for Story 1.3:** Until Epic 2 populates NFL state data, the badge will not render (returns `null` from the empty DB query). This is intentional and correct. Do not hardcode "Preseason" as a default.

#### Variant Logic

| DB season type value | Week | Badge label | Variant |
|---|---|---|---|
| `"pre"` | any | "Preseason" | preseason |
| `"regular"` | 1-18 | "Week {N}" | week |
| `"post"` | any | "Playoffs" | playoffs |
| `null` / any other | any | (omit badge) | — |

The offseason variant ("Offseason") renders when no current active season is found and the implementor explicitly chooses to show it rather than hiding. For this story, the default is to hide (return `null`). If the team wants an "Offseason" pill shown, they must explicitly set the fallback in code and document the decision.

#### Anatomy

```
<span> — pill container
  {label text}
</span>
```

No icon. Text only. The pill is non-interactive (not a button or link).

#### Styling Per Variant

| Variant | Background class | Text class | Notes |
|---|---|---|---|
| preseason | `bg-primary/10` | `text-primary` | Green-light bg, forest green text |
| week | `bg-primary/10` | `text-primary` | Same as preseason; week number interpolated |
| playoffs | `bg-[#FEF9EC]` | `text-[#B8860B]` | Gold-light bg, antique gold text |
| offseason | `bg-muted` | `text-muted-foreground` | Neutral bg, tertiary text |

Shared pill classes (all variants): `rounded-full px-3 py-1 text-caption uppercase tracking-widest font-medium`

When Story 1.2 tokens are confirmed, replace hardcoded hex values with the CSS custom properties:
- `text-[#B8860B]` -> `text-[--accent-gold]`
- `bg-[#FEF9EC]` -> `bg-[--accent-gold-light]`

#### Contrast Verification (Required)

Before shipping, verify contrast ratios:
- Preseason/Week: `text-primary` (`#2D5A3D`) on `bg-primary/10` (approximately `#EBF2ED`). Calculated ratio: ~6.5:1. Passes AA (4.5:1 required for 12px bold/caption text).
- Playoffs: `#B8860B` on `#FEF9EC`. Calculated ratio: ~4.6:1. Passes AA (barely; verify in browser with exact computed values).
- Offseason: `text-muted-foreground` (`#6B6560`) on `bg-muted` (`#F0ECE8`). Calculated ratio: ~3.8:1. Borderline for caption size; verify. If it fails, darken the text to `#57524D` or use `text-foreground` instead.

[UXA EXTRAPOLATION] The Offseason variant contrast against muted background may not meet 4.5:1 for caption-size text. The implementor must verify and adjust if needed.

#### Accessibility

- The pill is a `<span>` (not interactive), so no focus state or ARIA role needed
- It is descriptive text within the nav landmark, which is sufficient for screen reader context
- No `aria-label` needed; the text content is self-explanatory

#### States

| State | Behavior |
|---|---|
| Data available | Pill renders with correct variant |
| DB empty / query returns null | Component returns null; pill is absent from nav |
| DB query throws | Component catches error, returns null; pill absent |
| No active season | Component returns null |

---

### 3. SyncTimestamp — UPDATE

#### Files
- `components/sync-timestamp.tsx` (server component — update stale threshold calculation)
- `components/sync-timestamp-client.tsx` (client component — update stale color and add text indicator)

#### Stale Threshold Changes (`sync-timestamp.tsx`)

Current: `const isStale = diffMs > 3600000; // > 1 hour`

Replace with threshold branching:

```
daily data type: isStale = diffMs > 93600000   (26 hours)
all other types: isStale = diffMs > 7200000    (2 hours)
```

The `dataType` prop already exists. Map the following values to the daily threshold:
- `"daily"` (primary designation)
- Any `job_type` value confirmed by the sync pipeline as running once per day

Until the exact `job_type` values are confirmed from the sync pipeline (see OQ-4 from REQS brief), use a simple check: `dataType === "daily"`. The implementor should cross-reference the actual values written to `sync_log.job_type` by the sync pipeline and update the condition to match exactly.

[UXA EXTRAPOLATION] The `dataType` prop currently defaults to `"league"`. "League" is likely a daily sync job. The implementor must confirm whether `"league"` maps to daily or hourly and update the threshold condition accordingly. If uncertain, expose the threshold as a prop: `staleThresholdMs?: number` with a sensible default (7200000), allowing callers to override.

#### Stale Color and Text Indicator (`sync-timestamp-client.tsx`)

**Current behavior (incorrect):**
- `isStale ? "text-muted-foreground" : "text-foreground"` — this inverts intent; stale data gets the muted (less visible) treatment

**Required behavior:**
- Non-stale: `text-muted-foreground` (tertiary, quiet — data is fresh, no alarm needed)
- Stale: `text-[#C4402F]` (warm rust color — pre-1.2 fallback; replace with `text-[--accent-warm]` once token exists)

**Required text indicator (BR-5 — no color alone):**
- When `isStale === true`: append `" (outdated)"` to the visible label text, or swap the clock icon for a warning/alert triangle icon
- Recommended approach: append text. The label becomes: `Last updated {relativeTime} (outdated)`. This is simple, unambiguous, and screen-reader friendly.
- Alternative: swap `ClockIcon` for `WarningIcon` (triangle with exclamation) when stale. Both the icon change AND the text change would be acceptable; either alone satisfies BR-5.
- Do not use both approaches simultaneously (redundant).

**Recommended final rendering:**

Non-stale state:
```
[ClockIcon] Last updated {relativeTime}
```
Text color: `text-muted-foreground`

Stale state:
```
[ClockIcon] Last updated {relativeTime} (outdated)
```
Text color: `text-[#C4402F]`

The `(outdated)` suffix can be styled slightly smaller if desired (`text-[10px]`), but it must be part of the same accessible text node (not hidden or decorative).

The existing tooltip/toggle behavior (click to show absolute time) is preserved in both states.

#### Accessibility

- The button already has `type="button"`, which is correct
- The button should have a descriptive `aria-label` if the visible text is insufficient. Current label ("Last updated X ago") is sufficient as-is.
- When stale, the text change also updates the accessible name automatically (no separate `aria-label` needed)
- No `aria-live` needed on the timestamp itself; it is a server-rendered value

#### States

| State | Behavior |
|---|---|
| DB unavailable / no sync record | `"Data may be outdated"` fallback in muted color (existing, preserve) |
| Fresh data (within threshold) | Clock icon + "Last updated {relative}" in muted color |
| Stale data (beyond threshold) | Clock icon + "Last updated {relative} (outdated)" in warm rust color |
| Show absolute (toggle) | Block element below showing formatted absolute timestamp in muted small text |

---

### 4. SectionHeader — NEW

#### Component Type
React Server Component (pure presentational, no client directive, no data fetching).

#### File
`components/section-header.tsx`

#### Props

```typescript
interface SectionHeaderProps {
  title: string;
  viewAllHref?: string;
  viewAllLabel?: string; // defaults to "View All →" when viewAllHref is provided
}
```

#### Anatomy

```
<div> — flex items-center justify-between pb-2 border-b border-border mb-4
  <h3> — section title
  <Link href={viewAllHref}> — optional contextual link (only rendered when viewAllHref provided)
```

No outer `<section>` tag. This is a header row only, not a section wrapper. The consumer wraps in their own `<section>` or `<div>` as needed. This keeps the component composable.

#### Title Typography

`text-h3 font-bold`

Note: The project's `text-h3` utility class currently applies `font-weight: 500` (Medium). The Section Header title requires Bold (700). Apply `font-bold` as an explicit override alongside `text-h3`. This is intentional and documented.

Size range: 20-24px (matching H3 spec in CLAUDE.md).

Text color: `text-foreground` (default, `--text-primary`)

#### "View All" Link

- Only rendered when `viewAllHref` is provided
- Default label: `"View All →"` (literal arrow character, not an SVG icon)
- Override label: passed via `viewAllLabel` prop (e.g., `"Full Draft →"`, `"All Records →"`)
- Typography: `text-body-sm font-medium` (14px, Medium 500)
- Color: `text-primary` (forest green, `--accent-green`)
- Hover: `hover:underline`
- No underline by default (consistent with UX spec Contextual Links pattern)
- Focus state: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:rounded-sm`
- Minimum tap target: the link's padding should achieve 44px height on mobile. Use `py-2` on the link element to ensure touch target meets minimum. On desktop, standard inline spacing is fine.
- The arrow (`→`) is part of the visible text, not a separate decorative element, so no `aria-hidden` is needed on it.

#### Separator

The bottom border (`border-b border-border`) on the flex container serves as the visual separator. The separator line spans the full width of the component.

Bottom margin of `mb-4` (32px is too much for this header; 16px `mb-4` is appropriate) creates breathing room between the header and the content below it.

[UXA EXTRAPOLATION] The spec shows `mb-4` (16px) between the header and content. If the design calls for more separation (per 8px base unit system, 24px = `mb-6` is also acceptable). Implementor should use `mb-4` and adjust visually.

#### Usage Examples

```
// Minimal (no link)
<SectionHeader title="Recent Transactions" />

// With default link label
<SectionHeader title="Last Season's Best" viewAllHref="/records" />

// With custom link label
<SectionHeader title="2024 Draft" viewAllHref="/drafts/2024" viewAllLabel="Full Draft →" />
```

#### Accessibility

- `<h3>` provides the correct semantic heading level for section headers within a page that already has `<h1>` (page title) and potentially `<h2>` (major section via `PageSection`)
- The component does not render a wrapping `<section>` element to avoid forcing a specific landmark structure; consumers control that
- The "View All →" link text is self-descriptive in context. If used in a context where the section title is not immediately adjacent in the DOM hierarchy, consider wrapping the link text with the section name for screen readers: `<Link>View all {title} →</Link>` using the `title` prop. [UXA EXTRAPOLATION] For Phase 1, the default "View All →" label is acceptable given the visual proximity of the title.

#### States

| State | Behavior |
|---|---|
| Title only (no link) | Renders `<h3>` with separator; no link element in DOM |
| With link (default label) | Renders "View All →" link right-aligned |
| With link (custom label) | Renders custom label right-aligned |

No loading, error, or empty states apply. This is a pure presentational component with no async behavior.

---

### 5. BottomTabBar — RETIRE

#### Action Required
1. Remove `<BottomTabBar />` from `app/layout.tsx`
2. Remove the `import { BottomTabBar } from "@/components/bottom-tab-bar"` import from `app/layout.tsx`
3. The file `components/bottom-tab-bar.tsx` should be deleted (do not leave dead code)
4. Verify no other files import `BottomTabBar`

#### Replacement
The hamburger menu in `SiteNav` (mobile variant) is the complete replacement for mobile navigation. No functionality is lost: all 6 nav items are accessible via the hamburger menu. The Matchups item is dropped from the mobile nav as well (per BR-2: Matchups is not a nav item).

---

## Layout and Responsive Behavior

### Fixed vs Sticky Nav

| Viewport | Nav behavior | Rationale |
|---|---|---|
| Mobile (< md) | `fixed top-0` | Never scrolls away on mobile per FR-38; content must offset with `pt-14` |
| Desktop (md+) | `sticky top-0` | Standard sticky behavior; content does not need offset padding |

The `<header>` element uses conditional positioning. The simplest implementation: `sticky top-0` applies to both but `fixed` is needed on mobile to prevent scroll-away. Use `fixed top-0 md:sticky md:top-0` or simply `sticky top-0` (sticky behaves like fixed for the user's purposes on desktop). If testing reveals sticky is insufficient on mobile, switch the mobile breakpoint to `fixed`.

[UXA EXTRAPOLATION] In practice, `sticky` on the header may be sufficient on mobile as well (depends on scroll container setup in `app/layout.tsx`). The implementor should test on iOS Safari specifically; `position: sticky` has quirks with `overflow` on ancestor elements. If sticky fails on mobile Safari, use `fixed top-0` for all breakpoints and add the `pt-14` content offset unconditionally.

### Content Offset

`<main id="main-content">` class changes:
- Remove: `pb-20 md:pb-0` (BottomTabBar clearance, no longer needed)
- Add: `pt-14 md:pt-0` (fixed mobile nav clearance)
- Final class: `pt-14 md:pt-0` (plus any existing vertical padding from page-level components)

### Max-Width

No changes. The existing `max-w-[1200px] mx-auto w-full px-4 md:px-6 lg:px-8` wrapper on the `<div>` inside `<body>` is correct and compliant.

The `<header>` / nav bar is full-width (edge-to-edge background), but the inner `<nav>` container is constrained to `max-w-[1200px]` for content alignment. This is the existing pattern; preserve it.

---

## Interaction Flows

### Hamburger Menu Open/Close Flow

1. User taps hamburger button
   - `isOpen` state: `false` -> `true`
   - Button icon swaps from three-lines to X
   - `aria-expanded` updates to `"true"`
   - `aria-label` updates to `"Close navigation"`
   - Overlay renders below the fixed top bar
   - Focus moves to the first nav link in the overlay

2. User taps a nav link
   - Navigation occurs (Next.js router)
   - `isOpen` state: `true` -> `false`
   - Overlay unmounts
   - (Focus is on new page content)

3. User presses Escape key while overlay is open
   - `isOpen` state: `true` -> `false`
   - Overlay unmounts
   - Focus returns to hamburger button
   - `useEffect` or `onKeyDown` on the document/overlay handles this

4. User clicks outside the overlay
   - A backdrop layer or `onBlur` detection closes the overlay
   - `isOpen` state: `true` -> `false`
   - Focus behavior: wherever the click/tap was (standard browser behavior)
   - Implementation: attach a click handler to a transparent backdrop div behind the overlay, or use `useEffect` with a document-level mousedown listener

5. User presses hamburger button while open (X icon)
   - `isOpen` state: `true` -> `false`
   - Overlay unmounts
   - Focus stays on hamburger button

### Focus Trap Implementation

When the overlay is open:
- Listen for `keydown` on Tab
- If focus is on last nav link and Tab (not Shift): move focus to first nav link
- If focus is on first nav link and Shift+Tab: move focus to last nav link
- Escape key: close overlay, return focus to hamburger button

Implementation note: A simple manual focus trap (no library) is appropriate here given the small number of focusable elements (6 links). The hamburger button itself is behind the overlay; do not include it in the focus trap cycle.

### SyncTimestamp Toggle Flow

1. User clicks/taps the timestamp button
   - `showAbsolute` state: `false` -> `true`
   - Absolute timestamp row renders below the relative time
2. User clicks/taps again
   - `showAbsolute` state: `true` -> `false`
   - Absolute timestamp row unmounts

No other interaction flows apply to the layout components in this story.

---

## States Reference

### SiteNav

| State | Desktop | Mobile |
|---|---|---|
| Initial (server render) | Full nav bar visible, no active state hydrated yet | Fixed slim bar, overlay hidden |
| Hydrated | Active link highlighted via `usePathname` | Active link available in overlay when opened |
| Mobile overlay open | N/A | Overlay renders, hamburger shows X, focus trapped |
| Mobile overlay closed | N/A | Slim bar only, hamburger shows three-lines icon |

[UXA EXTRAPOLATION] There will be a brief flash of no active state between server render and client hydration. The server render cannot know `pathname`. This is acceptable given the "no client JS by default" philosophy — the flash is imperceptible at 12-user scale. If it becomes noticeable, the active state can be moved to a CSS `:focus-within` or CSS-only approach. For now, the client island handles it post-hydration.

### SeasonalPillBadge

| State | Behavior |
|---|---|
| DB has NFL state data | Correct variant pill renders |
| DB empty / no data | Component returns null, badge absent from nav |
| DB error | Component catches, returns null, badge absent |

### SyncTimestamp

| State | Server component renders | Client component renders |
|---|---|---|
| DB unavailable | Static fallback: "Data may be outdated" | N/A (server handles fallback) |
| Fresh sync record | Passes `isStale=false`, `relativeTime`, `absoluteTime` to client | Shows relative time in muted color |
| Stale sync record | Passes `isStale=true` | Shows relative time + "(outdated)" in warm rust color |
| Toggle active | N/A | Shows absolute time row below |

### SectionHeader

No loading/error/empty states. Purely presentational. Always renders given valid `title` prop.

---

## Design Tokens Reference

All tokens used by Story 1.3 components:

| Token | Current fallback | Future (post-1.2) | Usage |
|---|---|---|---|
| `--accent-green` | `--primary` (`#2D5A3D`) | `--accent-green` | Nav active state, View All links |
| `--accent-green-light` | `bg-primary/10` | `--accent-green-light` | SeasonalPillBadge preseason/week bg |
| `--accent-gold` | `#B8860B` (hardcode) | `--accent-gold` | SeasonalPillBadge playoffs text |
| `--accent-gold-light` | `#FEF9EC` (hardcode) | `--accent-gold-light` | SeasonalPillBadge playoffs bg |
| `--accent-warm` | `#C4402F` (hardcode) | `--accent-warm` | SyncTimestamp stale color |
| `--text-tertiary` | `--muted-foreground` (`#6B6560`) | `--text-tertiary` | SyncTimestamp non-stale color |
| `--surface-muted` | `--muted` (`#F0ECE8`) | `--surface-muted` | SeasonalPillBadge offseason bg |
| `--border` | `--border` (`#E8E4E0`) | `--border` | Section separator, nav border-b |
| `--background` | `--background` (`#FAF8F5`) | `--canvas` | Nav and overlay backgrounds |
| `--foreground` | `--foreground` (`#1A1A1A`) | `--text-primary` | SectionHeader title |

---

## Accessibility Requirements

### WCAG 2.1 AA Checklist

**SiteNav:**
- [ ] `<nav aria-label="Main navigation">` landmark present
- [ ] Active link has `aria-current="page"`
- [ ] Hamburger button: `aria-label` updates between "Open navigation" / "Close navigation"
- [ ] Hamburger button: `aria-expanded` reflects open/closed state
- [ ] Hamburger button: `aria-controls="mobile-nav-menu"` pointing to overlay container id
- [ ] Overlay container has `id="mobile-nav-menu"`
- [ ] Focus trap active when overlay is open
- [ ] Escape key closes overlay and returns focus to hamburger button
- [ ] Hamburger button minimum 44x44px tap target
- [ ] Nav links in mobile overlay minimum 44px height tap target
- [ ] All interactive elements have visible focus indicator: 2px solid `--primary` with 2px offset
- [ ] Brand link "HMLML" has descriptive context (it is the home link; add `aria-label="HMLML — Home"` to the brand link for screen readers) [UXA EXTRAPOLATION]
- [ ] `SeasonalPillBadge` inside nav: non-interactive, no ARIA role needed, text is self-explanatory
- [ ] No color-only active state indicators (underline + color on desktop; left border + color on mobile)
- [ ] Hover transition 150ms (no fast flash, no reduced-motion concern at this duration)

**SeasonalPillBadge:**
- [ ] Non-interactive `<span>`, no role or tabindex needed
- [ ] Text content is the complete accessible label
- [ ] Contrast ratio verified for each variant (see Contrast Verification section above)

**SyncTimestamp:**
- [ ] Stale state includes text indicator "(outdated)" — not color alone
- [ ] Button `type="button"` to prevent accidental form submission
- [ ] Accessible name derived from visible text content (no separate `aria-label` needed)
- [ ] Warm rust color (`#C4402F`) on `--background` (`#FAF8F5`): contrast ratio ~4.9:1. Passes AA.

**SectionHeader:**
- [ ] Uses `<h3>` semantic element
- [ ] "View All →" link visible text is descriptive in context
- [ ] "View All →" focus state: 2px ring, visible
- [ ] Arrow character `→` is part of visible text (no `aria-hidden` on it)
- [ ] Tap target for "View All" link meets 44px on mobile via `py-2` padding

### Animation / Motion

All components in this story comply with animation philosophy (Confidence, not flash):
- No entrance animations on nav, badges, or headers
- Nav overlay open/close: instant (no slide or fade); content appears/disappears immediately
- Card hover (150ms border color transition) does not apply to these layout components
- No `prefers-reduced-motion` concern since no animations are used

---

## Extrapolations

All departures from or additions to the UX spec are marked here:

1. **[UXA EXTRAPOLATION] Brand link aria-label:** Added `aria-label="HMLML — Home"` recommendation on the brand link. UX spec only specifies the hamburger's aria-label. The brand link needs context for screen readers since "HMLML" is an acronym with no inherent meaning.

2. **[UXA EXTRAPOLATION] Mobile active state — left border instead of underline:** On mobile vertical nav links, the underline active treatment from desktop does not adapt well. Left border accent (`border-l-2 border-primary`) is proposed as the mobile active indicator. This is consistent with common mobile nav patterns and still satisfies the "color + typographic treatment" requirement from WCAG.

3. **[UXA EXTRAPOLATION] SeasonalPillBadge null return:** The UX spec says "degrade gracefully" without specifying null vs "Offseason" fallback. Choosing null (no render) as the safer default to avoid false information. If the team prefers "Offseason" pill when no data exists, that is also acceptable but must be documented.

4. **[UXA EXTRAPOLATION] SyncTimestamp `dataType` threshold mapping:** The spec defines the threshold split (daily vs hourly) but does not enumerate every `job_type` value. The implementor should expose a `staleThresholdMs` prop as an override in addition to the `dataType` branching logic.

5. **[UXA EXTRAPOLATION] Nav overlay positioning:** Spec says "dropdown/overlay" but does not specify whether this is a full-screen modal overlay or a below-bar dropdown. Choosing below-bar dropdown (`fixed top-14`) as it is less disorienting and keeps the brand/badge visible in the bar above.

6. **[UXA EXTRAPOLATION] SectionHeader mb-4:** The UX spec shows a separator line but does not specify the margin below. `mb-4` (16px) chosen as consistent with the 8px base unit system and appropriate visual breathing room.

7. **[UXA EXTRAPOLATION] SiteNav hydration flash:** Server render cannot produce active-link state. Brief flash of no-active-state is acceptable. Documented for implementor awareness.

8. **[UXA EXTRAPOLATION] Sticky vs fixed on mobile:** CSS `sticky` on `<header>` may fail on mobile Safari in certain scroll container configurations. Implementor must test and fall back to `fixed top-0` with universal `pt-14` offset if needed.
