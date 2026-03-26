---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 1.3 — Core Layout Components
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**:
  1. TOKEN DEPENDENCY: Story references `--accent-warm` and `--accent-green` CSS custom properties, but `globals.css` currently uses shadcn/ui token names (`--primary`, `--muted-foreground`, etc.). These semantic HML tokens do not yet exist. Story 1.2 is supposed to define the full 15-token set. If 1.2 has not shipped the named tokens, 1.3 implementors must either (a) wait for 1.2, or (b) reference the shadcn equivalent mappings listed in the Equivalence Table below as a fallback. The brief flags this explicitly.
  2. NAV ARCHITECTURE CONFLICT: The current `SiteNav` is `"use client"` (uses `usePathname`). CLAUDE.md mandates React Server Components by default with `"use client"` only for the live score poller. However, active-link highlighting on a static nav requires knowing the current path. Resolution: the nav may remain `"use client"` for this narrow purpose, OR implement active-link detection via a Server Component wrapper with a small client island for the active state. The brief recommends the latter approach to stay compliant; the implementor must choose and document the decision.
  3. BOTTOM TAB BAR vs HAMBURGER: The existing mobile strategy uses `BottomTabBar` (fixed bottom bar with icons). The story AC requires a hamburger menu instead. These are mutually exclusive UX patterns. The UX spec explicitly says "Nav collapses to hamburger menu" (UX spec, Responsive Strategy, line 1492; Navigation Patterns, line 1351). The `BottomTabBar` component and its `<BottomTabBar />` invocation in `app/layout.tsx` must be retired. Confirm with orchestrator before removal.
  4. SEASONAL PILL BADGE DATA SOURCE: The badge must display the current season state (Preseason/Week N/Playoffs/Offseason). This data comes from the NFL state endpoint via the sync pipeline. If the DB is empty or the sync has not run, the badge must degrade gracefully (hide or show a neutral fallback). The query module for this does not yet exist; the implementor must create it or confirm Story 2.x will provide it.
---

## Story Reference

**Story:** 1.3 — Core Layout Components
**Epic:** 1 — Project Foundation & Design System
**Source:** `_work/epic-1/story-1.3/story.md`

---

## Restated Acceptance Criteria

All criteria traced to their source requirement.

### AC-1: Persistent Top Navigation — Items and Order
**Given** any page on the site
**When** the page renders
**Then** a persistent top nav displays exactly: `Hub | Teams | Records | History | Drafts | Players`

- Source: UX-DR27 (epics.md); UX spec Navigation Patterns line 1350; story.md Notes
- "Hub" maps to route `/` (home page); all others match existing routes
- **CHANGE REQUIRED:** Current `SiteNav` links array has `Matchups` as the first item pointing to `/matchups`. The story explicitly removes Matchups as a nav item (UX spec line 552: "Matchups: Not a nav item"). The nav must be updated to: Hub (`/`), Teams (`/teams`), Records (`/records`), History (`/seasons`), Drafts (`/drafts`), Players (`/players`)
- Active-state rule: current section highlighted with `--accent-green` underline or text color (UX spec Navigation Patterns line 1352); `aria-current="page"` on active link (existing pattern, preserve)
- Order is non-negotiable: Hub first, Players last

### AC-2: Brand Text
**And** the nav shows "HMLML" brand text on the left

- Source: UX-DR27; UX spec Navigation Patterns line 1353
- **EXISTING:** Current `SiteNav` already renders "HMLML" as a `<Link href="/">` with `text-lg font-bold text-primary`. This is compliant with the story.
- No change required to the brand text itself, but the "Hub" nav link and the brand text both point to `/`. The brand text link is the logo/home tap target; "Hub" in the nav list is the active-page indicator. Both must coexist.

### AC-3: Seasonal Pill Badge
**And** the nav shows a Seasonal Pill Badge on the right (Preseason/Week N/Playoffs/Offseason)

- Source: UX-DR24; story.md Notes; UX spec Tier 3 Utility Components line 1267
- **NEW COMPONENT:** `SeasonalPillBadge` does not exist yet. Must be built.
- Component signature: `SeasonalPillBadge` (Server Component, reads from DB)
- Four variants with exact styling:
  | Variant | Background | Text Color | Token mapping (pre-1.2) |
  |---|---|---|---|
  | "Preseason" | green-light bg | green text | `bg-primary/10 text-primary` |
  | "Week N" | green-light bg | green text | `bg-primary/10 text-primary` |
  | "Playoffs" | gold-light bg | gold text | `bg-[#FEF9EC] text-[#B8860B]` |
  | "Offseason" | neutral bg | tertiary text | `bg-muted text-muted-foreground` |
- "Week N" must interpolate the actual week number (e.g., "Week 9")
- Typography: Caption size (12px, Medium 500), uppercase, wide tracking — use `.text-caption` utility class
- Data source: query the DB for current NFL season state (week number + season type). If no data: render nothing (omit badge entirely) or show "Offseason" as the safe default. Implementor must decide and document.
- Pill shape: `rounded-full px-3 py-1`

### AC-4: Mobile Hamburger Menu
**And** the nav collapses to a hamburger menu on mobile (< 768px)
**And** the nav bar is fixed/slim on mobile and does not scroll away

- Source: UX-DR28; UX spec Navigation Patterns line 1351; UX spec Responsive Strategy line 1492
- **ARCHITECTURE CHANGE — See Flag #3:** The current mobile strategy is `BottomTabBar` (fixed bottom). The story requires a hamburger menu instead. The `BottomTabBar` component must be retired from `app/layout.tsx`.
- Hamburger behavior:
  - Below `md` breakpoint (< 768px): show a slim fixed top bar with HMLML brand + hamburger icon button
  - Hamburger button: `aria-label="Open navigation"` (UX spec line 1568); `aria-expanded` toggled on open/close
  - On open: nav items stack vertically in a dropdown/overlay
  - Escape key closes the menu (UX spec Keyboard Navigation line 1564)
  - Nav items in mobile menu are identical to desktop: Hub | Teams | Records | History | Drafts | Players
  - Seasonal Pill Badge visible in mobile top bar (right side of slim bar)
- Fixed position: `position: fixed; top: 0; z-index: 40` (existing desktop uses `sticky top-0 z-40`; mobile must also be fixed so it never scrolls away)
- Slim height: `h-14` (56px) matches existing desktop bar height
- Because the hamburger toggle requires client-side state, `SiteNav` will remain or become `"use client"` — see Flag #2. A hybrid Server/Client split is acceptable: Server Component renders the nav shell with links, Client Component island manages open/close state.
- Mobile nav overlay: must trap focus when open; close on outside click or Escape

### AC-5: Sync Timestamp in Footer
**And** a Sync Timestamp component appears in the footer showing last sync time

- Source: UX-DR23; FR32; UX spec Tier 3 Utility Components line 1258
- **EXISTING:** `SyncTimestamp` (server) + `SyncTimestampClient` (client) both exist and are already wired into `SiteFooter`. The architecture (server query + client island for interactivity) is correct.
- **CHANGE REQUIRED:** Current stale threshold is `> 1 hour` (hardcoded in `sync-timestamp.tsx` line 66). The story specifies two distinct thresholds:
  - Hourly data: stale if > 2 hours
  - Daily data: stale if > 26 hours
  - Source: story.md Notes; UX spec line 1408
- Current implementation has a single `dataType` prop but only one stale threshold. The stale calculation must branch on `dataType`:
  - `dataType === "daily"` (or equivalent): stale threshold = 26 hours (93,600,000ms)
  - All others (hourly): stale threshold = 2 hours (7,200,000ms)
- **CHANGE REQUIRED:** Stale color. The story says the timestamp "turns warm color" when stale. The UX spec says `--accent-warm` color. The current implementation applies `text-muted-foreground` when NOT stale and falls back to the same on stale — no distinct stale color is rendered. `SyncTimestampClient` line 38 has `isStale ? "text-muted-foreground" : "text-foreground"` which actually inverts the intent (stale is muted, non-stale is foreground — should be opposite or use the warm token). Fix: when `isStale === true`, apply warm accent color. Pre-1.2 fallback: `text-[#C4402F]` or map to `--loss` if `--accent-warm` is unavailable; confirm with 1.2 output.
- Typography: `.text-caption` (12px, Medium 500) — already applied, preserve

### AC-6: Section Header Component
**And** a Section Header component is available (title left, optional "View All" link right)

- Source: UX-DR22; UX spec Tier 3 Utility Components line 1243; UX spec Contextual Links line 1365
- **EXISTING PARTIAL:** `PageSection` component exists at `components/page-section.tsx` but is NOT the Section Header. `PageSection` wraps a full section with `<section>` tag, H2 heading, and children. It does not support a "View All" link and uses H2 (not H3).
- **NEW COMPONENT REQUIRED:** `SectionHeader` (`components/section-header.tsx`). This is distinct from `PageSection`.
- Component interface:
  ```
  SectionHeader({ title: string, viewAllHref?: string, viewAllLabel?: string })
  ```
  - `viewAllLabel` defaults to `"View All →"` when `viewAllHref` is provided
  - `viewAllLabel` allows overrides (e.g., "Full Draft →") per UX spec line 1366
- Anatomy (UX spec line 1250):
  - Left: title in H3 bold (`text-h3 font-bold` — note: current `text-h3` uses `font-weight: 500`, story requires bold/700 for Section Header title specifically; apply `font-bold` override)
  - Right: optional "View All →" link in `--accent-green` / `text-primary`, medium weight
  - Horizontal rule or visual separator below (the UX spec shows a line `─────`)
- Layout: `flex items-center justify-between` with full-width bottom border (`border-b border-border`) or equivalent separator
- "View All" link: `text-primary font-medium hover:underline` per globals.css link hierarchy; `text-body-sm` size
- Server Component (no interactivity needed)
- This component must be usable from any page, not just the hub

### AC-7: Root Layout 1200px Max-Width
**And** the root layout constrains content to 1200px max-width on desktop

- Source: CLAUDE.md ("Content max-width: 1200px centered on desktop"); UX spec Responsive Strategy
- **EXISTING:** `app/layout.tsx` line 35 already wraps content in `<div className="mx-auto w-full max-w-[1200px] px-4 md:px-6 lg:px-8">`. This is compliant.
- **MINOR CHECK:** The `pb-20 md:pb-0` on `<main>` was padding-bottom for the bottom tab bar. If `BottomTabBar` is retired (see AC-4), `pb-20` is no longer needed. Remove it. Post-change: `<main id="main-content">` with no bottom padding override needed.
- No other changes to layout.tsx structure required.

---

## Database Changes

None required by this story directly.

The `SeasonalPillBadge` (AC-3) needs to query the current NFL season state. This may map to an existing table (e.g., `seasons` or a `nfl_state` record populated by the sync pipeline). If no such table exists yet, the badge must degrade gracefully. The implementor must:
1. Check if a current-season state query exists in `lib/queries/`
2. If not, either: (a) add a minimal query to `lib/queries/seasons.ts` (or equivalent) that returns the current week/season type, or (b) hardcode "Offseason" as the default until Epic 2 populates it
3. Do NOT create a new DB table for this story; rely on Epic 2's schema

---

## API Endpoints

None new for this story. All components are pure UI/layout with DB reads via existing query modules.

---

## Validation Schemas

None. This story contains no Sleeper API calls and no sync operations.

---

## Business Rules

**BR-1 — Nav Item Order (Non-Negotiable)**
Hub | Teams | Records | History | Drafts | Players. This exact order, no deviations.
Source: story.md Notes; UX spec Navigation Structure line 1350.

**BR-2 — Matchups Is Not a Nav Item**
The Matchups route (`/matchups`) is accessible via hub cards but not via primary nav.
Source: UX spec line 552. Current `SiteNav` and `BottomTabBar` both include Matchups; both must be updated.

**BR-3 — Seasonal Pill Badge Variants**
Four legal variants only: "Preseason", "Week [N]" (where N is integer 1-18), "Playoffs", "Offseason". No other strings. The week number must come from real data, not be hardcoded.
Source: story.md Notes; UX-DR24.

**BR-4 — Stale Threshold Split**
Hourly sync staleness: > 2 hours. Daily sync staleness: > 26 hours. Current 1-hour threshold is incorrect for both.
Source: story.md Notes; UX spec line 1408.

**BR-5 — No Color-Only Information**
Stale state on SyncTimestamp must not rely on color alone. The existing approach (color change only) must be accompanied by a text indicator or icon change. Acceptable: append "(outdated)" to the label, or change the icon to a warning icon.
Source: NFR12; CLAUDE.md Accessibility section; UX spec line 1554.

**BR-6 — Hamburger Accessibility**
Hamburger button must have `aria-label="Open navigation"` (closed state) and `aria-label="Close navigation"` (open state). `aria-expanded` must reflect open/closed state. Focus must be trapped within the open menu.
Source: UX spec line 1568; WCAG 2.1 AA.

**BR-7 — Hub Route**
"Hub" in the nav maps to `/` (root). `isActive` detection: `pathname === "/"` only (no `startsWith` for root, as that matches everything).
Source: Inferred from nav structure; current code uses `pathname.startsWith(href + "/")` which would be incorrect for `/`.

---

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| Server Components by default | PARTIAL | SiteNav is currently `"use client"`. See Flag #2 for resolution approach. SeasonalPillBadge and SectionHeader must be Server Components. |
| `"use client"` boundary | REQUIRED | Nav hamburger toggle needs client state. Keep as minimal client island. SyncTimestampClient already correctly isolated. |
| No Sleeper API calls from components | COMPLIANT | All data comes from DB queries. |
| WCAG 2.1 AA | REQUIRED | Hamburger focus trap (BR-6), stale timestamp text label (BR-5), all existing contrast ratios preserved. |
| No color alone for information | REQUIRED | BR-5: stale timestamp must add text/icon change. |
| No red/purple pairings | COMPLIANT | Warm accent color for stale state avoids red/purple. Confirm `--accent-warm` token value from Story 1.2 output. |
| Mobile touch targets 44x44px | REQUIRED | Hamburger button, nav links in mobile menu. Verify during implementation. |
| Escape key closes mobile nav | REQUIRED | BR-6 and UX spec line 1564. |
| Skip-to-content link | EXISTING | Already present in layout.tsx; preserve. |
| tabular-nums on scores/stats | N/A | No score/stat display in these layout components. |
| Drizzle ORM for DB access | REQUIRED | SeasonalPillBadge query must use existing Drizzle query modules only. |
| `aria-current="page"` on active nav | EXISTING | Preserve existing pattern. |

---

## NFR Targets

| NFR | Requirement | Implementation Note |
|---|---|---|
| NFR1 | Standard pages load within 3 seconds | Nav and footer are Server Components; no client-side data fetching. SeasonalPillBadge is an async Server Component; keep its DB query simple (single row lookup). |
| NFR12 | No information by color alone | BR-5 applies. |
| NFR13 | No red/purple color pairings | `--accent-warm` (rust/terra cotta) is the stale indicator; not red or purple. |
| NFR14 | WCAG 2.1 AA contrast | All new components must meet 4.5:1 body, 3:1 large text. Verify SeasonalPillBadge pill text against pill background for each variant. |
| FR32 | "Last updated" timestamp on every page | SyncTimestamp already in SiteFooter on every page. Stale threshold fix required. |
| FR35 | Correct render on mobile, tablet, desktop | Hamburger on mobile, full nav on md+. |
| FR38 | Persistent navigation element | Fixed top bar on mobile (never scrolls away); sticky on desktop. |

---

## Component Inventory: What Exists vs What Changes vs What's New

### `components/site-nav.tsx` — UPDATE
| Aspect | Current State | Required Change |
|---|---|---|
| Nav items | Matchups, Teams, Records, Drafts, History, Players | Hub (`/`), Teams, Records, History, Drafts, Players. Remove Matchups. |
| Nav order | Matchups first | Hub first, exact order per BR-1 |
| Mobile handling | `hidden md:block` (invisible on mobile) | Add hamburger menu for mobile (< 768px), fixed top bar |
| Client directive | `"use client"` for `usePathname` | Retain `"use client"` for hamburger state + pathname; or split into Server shell + Client island |
| Seasonal Pill Badge | Absent | Add `<SeasonalPillBadge />` to the right side of nav bar |
| Active state for Hub | Would match `/` + anything (bug) | Fix: Hub active only when `pathname === "/"` |
| Position (mobile) | `hidden` on mobile | Fixed top bar on mobile (`fixed top-0`) |

### `components/bottom-tab-bar.tsx` — RETIRE (pending orchestrator confirmation per Flag #3)
| Aspect | Current State | Action |
|---|---|---|
| Component | BottomTabBar with icons, fixed bottom | Retire; hamburger replaces mobile nav |
| layout.tsx import | `<BottomTabBar />` imported and rendered | Remove import and JSX |
| Items | Matchups, Teams, Records, Drafts, History, Players | Superseded by hamburger nav |

### `app/layout.tsx` — MINOR UPDATE
| Aspect | Current State | Required Change |
|---|---|---|
| Bottom tab bar | `<BottomTabBar />` rendered | Remove if BottomTabBar is retired |
| Main padding | `pb-20 md:pb-0` (for tab bar clearance) | Remove `pb-20` if BottomTabBar is retired; change to `pb-0` or remove class |
| Max-width wrapper | `max-w-[1200px]` | Already correct; no change |
| Nav padding for fixed top bar | None | Add `pt-14` to offset fixed nav height on mobile (prevent content hidden behind fixed bar) |

### `components/sync-timestamp.tsx` — UPDATE
| Aspect | Current State | Required Change |
|---|---|---|
| Stale threshold | `> 1 hour` hardcoded | Branch on `dataType`: daily = > 26hrs, others = > 2hrs |
| `dataType` prop | Already exists (`"league"` default) | Map known daily data types to 26hr threshold |

### `components/sync-timestamp-client.tsx` — UPDATE
| Aspect | Current State | Required Change |
|---|---|---|
| Stale color | `isStale ? "text-muted-foreground" : "text-foreground"` (inverted — stale shows muted, fresh shows foreground) | Fix: stale = warm accent color (`text-[--accent-warm]` or fallback); non-stale = tertiary/muted |
| Stale text label | Color change only | Add text/icon indicator per BR-5 (e.g., append "(outdated)" or swap clock icon to warning icon) |

### `components/seasonal-pill-badge.tsx` — NEW
| Aspect | Specification |
|---|---|
| File | `components/seasonal-pill-badge.tsx` |
| Type | Async Server Component |
| Props | None (reads current state from DB internally) |
| Variants | "Preseason", "Week N", "Playoffs", "Offseason" |
| Styling | `rounded-full px-3 py-1 text-caption uppercase tracking-widest` + variant-specific bg/text |
| Data | Query from DB (current NFL state/season); degrade gracefully if unavailable |
| Fallback | Render nothing, or render "Offseason" pill, if DB query fails or returns null |

### `components/section-header.tsx` — NEW
| Aspect | Specification |
|---|---|
| File | `components/section-header.tsx` |
| Type | Server Component (pure presentational) |
| Props | `title: string`, `viewAllHref?: string`, `viewAllLabel?: string` |
| `viewAllLabel` default | `"View All →"` when `viewAllHref` is provided |
| Title typography | `text-h3 font-bold` (H3 size, bold weight — override `text-h3`'s default 500 weight) |
| Separator | `border-b border-border mb-4` or `pb-2` below the header row |
| "View All" link | `text-primary font-medium hover:underline text-body-sm` |
| Layout | `flex items-center justify-between` |
| Export | Named export `SectionHeader` |

### `components/page-section.tsx` — NO CHANGE
This component is a page-level section wrapper (H2 heading, full section padding, label). It is not the Section Header component. They serve different purposes and must coexist. Do not merge them.

---

## Token Equivalence Table (Pre-Story-1.2 Fallback)

If Story 1.2's full token set is not yet available, use these shadcn/ui equivalents:

| UX Spec Token | shadcn/ui Equivalent | Hex Value |
|---|---|---|
| `--accent-green` | `--primary` | `#2D5A3D` |
| `--accent-green-light` | `--primary` at 10% opacity | `bg-primary/10` |
| `--accent-gold` | `--gold` | `#B8860B` |
| `--accent-gold-light` | `#FEF9EC` (hardcode) | `#FEF9EC` |
| `--accent-warm` | `--loss` | `#C4402F` |
| `--text-tertiary` | `--muted-foreground` | `#6B6560` |
| `--surface-muted` | `--muted` | `#F0ECE8` |
| `--canvas` | `--background` | `#FAF8F5` |
| `--border-strong` | `--border` | `#E8E4E0` |

---

## Forward Dependencies

| Dependency | Required By | Notes |
|---|---|---|
| Story 1.2 full token set | SeasonalPillBadge, SyncTimestampClient stale color | If 1.2 tokens are not available, use equivalence table above |
| Epic 2 DB schema (NFL state / seasons table) | SeasonalPillBadge data source | Badge degrades to "Offseason" or hidden until Epic 2 populates data |
| Epic 2 `lib/queries/` modules | SeasonalPillBadge | May need a new or extended query function |
| Story 1.3 SectionHeader | All subsequent epics (Hub, Teams, Records, etc.) | Every content page uses SectionHeader; export must be stable |
| Story 1.3 SiteNav | All subsequent epics | Nav structure must be locked before other pages are built |

---

## Open Questions

**OQ-1 (Flag #2 — Client directive):** Should `SiteNav` remain a single `"use client"` component, or be split into a Server Component shell (static links, brand text, SeasonalPillBadge) with a Client island for hamburger state and active-link highlighting? Recommendation: split for CLAUDE.md compliance, but either is acceptable. Decision must be documented in `cross-story-context.md`.

**OQ-2 (Flag #3 — BottomTabBar retirement):** Confirm orchestrator approval to remove `BottomTabBar` from `app/layout.tsx` and retire the component. The story's hamburger requirement makes this a forced replacement, but it is a visible UX change. If there is any reason to keep the bottom bar, this must be flagged before implementation begins.

**OQ-3 (SeasonalPillBadge data source):** What query returns the current NFL state (week number, season type)? If no query exists in `lib/queries/`, the implementor must either create one (simple: select current season state row) or use a hardcoded fallback. This should be confirmed before building the component to avoid wasted effort.

**OQ-4 (SyncTimestamp dataType mapping):** The `dataType` prop currently defaults to `"league"`. What are the actual `job_type` values stored in `sync_log`? The stale threshold branch (`daily` vs `hourly`) must match the values actually written by the sync pipeline. Until Epic 2 confirms the sync log schema, the implementor should use a configurable threshold prop as an alternative.
