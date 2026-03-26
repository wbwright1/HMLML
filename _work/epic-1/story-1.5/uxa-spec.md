---
## Orchestrator Summary
- **Agent**: UXA
- **Story**: 1.5 — Empty State & Error Components
- **Status**: COMPLETE
- **State transition**: reqs-complete -> uxa-complete
- **Key decisions**: All copy finalized per spec. Three files require targeted edits (no rewrites). EmptyState iconMap needs no new keys — all 7 variants map to existing keys. not-found.tsx needs copy + second link + Button import. error.tsx needs description rewrite + "Go home" secondary link.
---

# UXA Spec: Story 1.5 — Empty State & Error Components

## 1. Components

### 1.1 `components/empty-state.tsx` — Gap-fill update

**Current structure:** Correct. Centered flex column, py-16, max-w-[400px] mx-auto, icon at 48px (size-12), aria-hidden="true", h3 title, muted body, optional action link.

**Required changes — iconMap audit:**

Cross-reference all 7 page-specific variants against the existing iconMap:

| Variant | Required Key | Exists in iconMap? |
|---|---|---|
| Homepage (no data) | `chart` | YES — BarChart3 |
| Matchups (no data) | `calendar` | YES — Calendar |
| Teams (no data) | `users` | YES — Users |
| Seasons (no data) | `calendar` | YES — Calendar |
| H2H (no data) | `chart` | YES — BarChart3 |
| Player search (no results) | `search` | YES — Search |
| Error page (inline) | `alert` | YES — AlertCircle |

**Verdict: No new icons needed.** All 7 variants map to existing keys. The `trophy` key (Trophy icon) is also present in the map and used by records pages.

**No structural changes required** to `empty-state.tsx`. The component already meets the spec. The DEV agent should verify this mapping and add a code comment listing the canonical variant keys for page-level implementors.

**Accessibility verification:**
- Icon: `aria-hidden="true"` — correct. Icon is decorative; meaning is fully carried by title + description text.
- Title uses `<h3>` — correct heading level for a section-level component rendered inside a page that already has an `<h1>`.
- No additional `role` or `aria-label` needed on the wrapper `<div>`. The heading provides sufficient landmark context.
- Action link uses `<Link>` which renders as `<a>` — no additional `aria-label` needed when the link text is descriptive (e.g., "Browse league history").

---

### 1.2 `app/not-found.tsx` — Rewrite to spec

**Current state:** Generic title "Page not found", single "Back to home" link with inline ad-hoc button classes.

**Required changes:**

#### Layout
Keep the existing centering wrapper: `flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center`. No layout changes needed.

#### Title
- Remove: "Page not found"
- Add: "This page doesn't exist."
- Element: `<h1>` (page-level heading)
- Class: `text-h2` (existing class, unchanged)

#### Body copy
- Remove: "The page you're looking for doesn't exist or may have been moved."
- Add: "Maybe it was traded away."
- Element: `<p>`
- Class: `text-body text-muted-foreground max-w-md`

#### Navigation — two links required

Replace the single inline-styled link with two `Button` component instances:

**Primary link — Hub:**
- Label: "Go to Hub"
- Href: `/`
- Button variant: `default` (forest green background, cream foreground)
- Button size: `lg`
- Renders as: `<Button asChild size="lg"><Link href="/">Go to Hub</Link></Button>`

**Secondary link — Teams:**
- Label: "Browse Teams"
- Href: `/teams`
- Button variant: `outline`
- Button size: `lg`
- Renders as: `<Button asChild variant="outline" size="lg"><Link href="/teams">Browse Teams</Link></Button>`

**Button group layout:** Wrap both buttons in a `<div className="flex flex-col sm:flex-row gap-3">` so they stack on mobile and sit side-by-side on small+ screens.

#### Import requirements
- Add: `import { Button } from "@/components/ui/button";`
- Keep: `import Link from "next/link";`
- No `"use client"` directive — this is a pure server component.

#### Exact final copy (verbatim, no em-dashes):
```
Title:   "This page doesn't exist."
Body:    "Maybe it was traded away."
Link 1:  "Go to Hub"
Link 2:  "Browse Teams"
```

---

### 1.3 `app/error.tsx` — Targeted update

**Current state:** Correct `"use client"` directive. "Something went wrong" title. Two-paragraph description with "If the problem persists" sentence (no spec basis). Single "Try again" Button. No secondary "Go home" link.

**Required changes:**

#### Title
Keep as-is: "Something went wrong"
- Element: `<h1>`
- Class: `text-h2`
- No change needed.

#### Description — rewrite
Remove both existing `<p>` elements and replace with a single description block:

**Paragraph 1 (primary error message):**
- Copy: "Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment."
- Element: `<p>`
- Class: `text-body text-muted-foreground max-w-md`

**Paragraph 2 (last-data assurance):**
- Copy: "We're showing the last available data."
- Element: `<p>`
- Class: `text-caption text-muted-foreground mt-2`

Remove entirely: "If the problem persists, data may be outdated or the service may be under maintenance." — this sentence has no spec basis and contradicts the calm, confident tone.

#### Actions — two required

**Primary action (existing):**
- "Try again" Button calling `reset()`
- Keep variant: `default`, size: `lg`
- No change.

**Secondary action (new):**
- Label: "Go home"
- Href: `/`
- Rendered as: `<Button asChild variant="outline" size="lg"><Link href="/">Go home</Link></Button>`
- Import `Link from "next/link"` (add if not already imported).

**Action group layout:** Wrap both actions in `<div className="flex flex-col sm:flex-row gap-3">` — same pattern as not-found.tsx for visual consistency.

#### Exact final copy (verbatim, no em-dashes):
```
Title:      "Something went wrong"
Paragraph:  "Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment."
Assurance:  "We're showing the last available data."
Button 1:   "Try again"  (calls reset())
Button 2:   "Go home"    (links to /)
```

#### Preserved:
- `"use client"` directive — required by Next.js for error boundaries.
- `Button` import from `@/components/ui/button`.
- `reset` prop destructure from function signature.
- `error` prop in function signature (even if unused, required by Next.js boundary type).

---

## 2. Layout & Responsive Behavior

### EmptyState component
- Mobile (< 640px): Full width, 16px horizontal padding from page root. Max-width 400px centers it on wider mobile viewports. Icon, title, description, and action link stack vertically. No horizontal scroll risk.
- Desktop (>= 640px): Centered within content area, max-w-[400px] constrains width. Generous py-16 (64px) top and bottom padding maintains "Apple-level breathing room."
- The component imposes no outer container — it is composable alongside `SyncTimestamp` (rendered above or below independently by the page).

### not-found.tsx and error.tsx
- Both use `min-h-[50vh]` centering — the page fills at least half the viewport height, placing the content in the visual center regardless of total page height.
- Button group: `flex-col` on mobile (buttons stack), `sm:flex-row` (buttons side by side). Gap of 3 (12px) between buttons. This is slightly below the 8px grid minimum but consistent with shadcn/ui button group spacing conventions. [UXA EXTRAPOLATION: gap-3 is not a strict 8px-grid multiple at 12px, but is a standard shadcn/ui pattern. If strict grid compliance is required, use gap-4 (16px) instead.]
- Both pages render inside the root layout's padding and max-width context (1200px centered) per the story 1.3 forward dependency.

---

## 3. Interaction Flows

### EmptyState
- No interactive states except the optional action link.
- Action link: default link underline-on-hover behavior. Focus state: browser default focus ring (or `focus-visible:ring-2 focus-visible:ring-ring` per design system).
- No loading state (component is rendered only when data-fetching is complete and the result is empty).

### not-found.tsx
- Static page. No data fetching, no loading state.
- "Go to Hub" button: navigates to `/`. Focus: `focus-visible:ring-2 focus-visible:ring-ring/50` (inherited from Button component).
- "Browse Teams" button: navigates to `/teams`. Same focus treatment.
- Keyboard navigation: Tab order is title → body → "Go to Hub" → "Browse Teams". Natural DOM order.

### error.tsx
- "Try again" button: calls `reset()` which triggers React's error boundary retry. The button is a `<button>` element (not a link). Focus after click: focus may shift depending on whether the re-render succeeds; no explicit focus management needed beyond the button's own focus state.
- "Go home" link: navigates to `/`. Rendered via `Button asChild` wrapping `Link` — it is an `<a>` element with full button styling.
- Keyboard navigation: Tab order is title → description → "Try again" → "Go home".

---

## 4. States

### EmptyState (all variants)
| State | Behavior |
|---|---|
| Initial render | Component renders immediately; no loading state (called only when data is empty) |
| With icon | Icon displays at 48px, muted (text-muted-foreground/50), aria-hidden |
| Without icon | Icon slot is omitted; title renders at top of container |
| With action | Action link renders below description with `mt-4` spacing |
| Without action | Container ends after description paragraph |

### not-found.tsx
| State | Behavior |
|---|---|
| Only state | Static render: title, body, two nav buttons |

### error.tsx
| State | Behavior |
|---|---|
| Error displayed | Title + two paragraphs + two actions rendered |
| After "Try again" click | reset() fires; React attempts to re-render the parent segment; if it succeeds, error boundary unmounts; if it fails, error page re-renders |
| After "Go home" click | Client-side navigation to `/` |

---

## 5. Design Tokens

All tokens are CSS custom properties defined in `globals.css`. No hardcoded hex values permitted.

| Element | Token / Class | Value |
|---|---|---|
| Page background | `bg-background` | `#FAF8F5` (cream) |
| Icon color | `text-muted-foreground/50` | `#6B6560` at 50% opacity |
| Title | `text-h3` (EmptyState), `text-h2` (not-found, error) | Geist Sans Bold 700 |
| Description | `text-body text-muted-foreground` | 16px, `#6B6560` |
| Assurance line | `text-caption text-muted-foreground` | 12px Medium 500, `#6B6560` |
| Primary button | `bg-primary text-primary-foreground` | Forest green `#2D5A3D`, cream foreground |
| Outline button | `border-border bg-background hover:bg-muted` | Warm light gray border |
| Action link (EmptyState) | `text-primary font-medium hover:underline` | Forest green `#2D5A3D` |
| Vertical padding | `py-16` | 64px (8 × 8 base unit) |
| Element gap | `gap-6` (page-level), `gap-2` (text group) | 24px / 8px |

---

## 6. Accessibility Requirements

### All three components

- **WCAG 2.1 AA contrast:** All text meets 4.5:1 ratio. `text-muted-foreground` (`#6B6560`) on `#FAF8F5` background = 4.6:1 (passes). Primary button text (cream on forest green) meets 4.5:1.
- **No red/purple pairings:** None of these components use red or purple. The outline button uses the warm gray border system.
- **No color-only information:** Icons carry `aria-hidden="true"`. All meaning is in title + description text.
- **Tabular figures:** Not applicable — these components contain no numeric statistics.

### EmptyState specific
- `<h3>` heading level is correct for a section-level component. Pages using EmptyState must ensure a parent `<h1>` or `<h2>` exists in the document outline.
- Action link text must be descriptive on its own (no "click here" or "learn more"). All 7 variant action labels in the spec are descriptive: "Browse league history", "Go home".

### not-found.tsx specific
- `<h1>` used for page title — correct, this is the sole heading on the 404 page.
- Both navigation buttons include descriptive text. No icon-only buttons.
- `Button asChild` renders `<a>` for link navigation — correct semantic element with button styling.
- Page `<title>` is set by Next.js metadata conventions; the root layout handles the site-wide title; not-found.tsx does not need explicit metadata exports unless per-page title customization is desired. [UXA EXTRAPOLATION: Adding `export const metadata = { title: "Page Not Found | HML" }` would improve screen reader announcement on navigation. Recommend adding if the DEV agent has a few minutes, but not blocking.]

### error.tsx specific
- `"use client"` required by Next.js — no RSC alternative available.
- The `error` prop (even if unused in rendering) must remain in the destructure for Next.js type compatibility.
- "Try again" is a `<button>` — correct interactive element for a JS action (calling `reset()`).
- "Go home" uses `Button asChild` with `<Link>` — renders as `<a>` — correct semantic element for navigation.
- Focus management after reset(): React will re-render the subtree; focus lands on the top of the new content. No explicit `autoFocus` or `focus()` call is needed. [UXA EXTRAPOLATION: Advanced focus management (moving focus to the top of the page after reset) would improve screen reader experience but is out of scope for Phase 1.]

---

## 7. Variant Reference Table (for page implementors)

All 7 canonical EmptyState variants, ready to copy into page components:

| Page | `icon` prop | `title` prop | `description` prop | `actionLabel` | `actionHref` |
|---|---|---|---|---|---|
| Homepage (no data) | `"chart"` | `"Syncing League Data"` | `"We're pulling data from Sleeper. Standings, matchups, and history will appear here once the first sync completes."` | — | — |
| Matchups (no data) | `"calendar"` | `"No Matchups Yet"` | `"Matchup data will appear once the season begins and scores sync from Sleeper."` | `"Browse league history"` | `"/seasons"` |
| Teams (no data) | `"users"` | `"Loading Franchises"` | `"Franchise data is syncing from Sleeper. Check back shortly."` | — | — |
| Seasons (no data) | `"calendar"` | `"No Seasons Yet"` | `"Season history will appear after the first data sync completes."` | — | — |
| H2H (no data) | `"chart"` | `"Select Two Franchises"` | `"Choose two franchises above to see their head-to-head history."` | — | — |
| Player search (no results) | `"search"` | `"No Players Found"` | `"No players match '[query]'. Check the spelling or try a different name."` | — | — |
| Error page (inline) | `"alert"` | `"Something Went Wrong"` | `"Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment."` | `"Go home"` | `"/"` |

**Note on Player search variant:** The `[query]` placeholder must be interpolated by the calling page before passing the string to the `description` prop. The `EmptyState` component receives the final interpolated string. Example: `description={\`No players match '${searchQuery}'. Check the spelling or try a different name.\`}`

**Note on transient sync states:** "Syncing League Data", "Loading Franchises", and "No Seasons Yet" describe the initial sync state (zero DB rows), not an error. They should not appear alongside an error boundary — they are shown by page-level conditional rendering when the data query returns an empty array.

---

## 8. Extrapolations

- **[UXA EXTRAPOLATION] Button gap:** The `gap-3` (12px) spacing between paired buttons in not-found.tsx and error.tsx is not strictly on the 8px grid. If strict grid adherence is required, use `gap-4` (16px). The visual difference is negligible.
- **[UXA EXTRAPOLATION] not-found.tsx metadata:** Adding `export const metadata = { title: "Page Not Found | HML" }` would improve the screen reader page announcement. Not blocking.
- **[UXA EXTRAPOLATION] error.tsx focus management:** After `reset()` fires and the page re-renders successfully, focus lands wherever the browser places it. For screen reader users, a skip-to-content mechanism or explicit focus movement would improve UX. Out of scope for Phase 1.
- **[UXA EXTRAPOLATION] EmptyState wrapper role:** No additional `role` attribute is needed on the wrapper `<div>`. The `<h3>` heading provides sufficient document outline context. If in the future EmptyState is rendered inside a `<section>` with no accessible name, the page-level implementor should add `aria-label` to that `<section>`.
- **[UXA EXTRAPOLATION] Composability with SyncTimestamp:** Pages should render `SyncTimestamp` as a sibling above or below `EmptyState`, not inside it. The `EmptyState` component has no internal layout that would conflict with an adjacent timestamp. Suggested markup pattern for a page section: `<SyncTimestamp ... />` then `<EmptyState ... />` within the same page section container.
