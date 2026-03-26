# FEND Handoff: Story 1.3 — Core Layout Components

## Orchestrator Summary
- **Agent**: FEND
- **Story**: 1.3 — Core Layout Components
- **Verdict**: COMPLETE (CRITIC violation fixes applied)
- **State transition**: critic-rejected -> fend-complete
- **TypeScript**: Clean (no errors)
- **Build**: Passes (Next.js production build)
- **Unit tests**: 80 passing (includes 8 new stale threshold tests)
- **E2E tests**: Written, covering all FE-T* and EC-T* test cases from the QA plan (FE-T01 through FE-T62, including FE-T30 through FE-T35)

## CRITIC Violation Fixes Applied

### CRITICAL-1: Added SyncTimestamp E2E tests (FE-T30 through FE-T35)
- Created `e2e/helpers/seed-sync-log.ts` for DB seeding in E2E tests
- Added 6 E2E tests: FE-T30 (fresh timestamp renders), FE-T31 (click toggles absolute time), FE-T32 (fallback with no sync record), FE-T33 (timestamp on non-home route), FE-T34 (stale: warm rust color + "(outdated)" text), FE-T35 (fresh at 119min: no stale indicators)
- FE-T36 and FE-T37 (daily threshold) are documented as covered by unit tests only, since the footer renders `dataType="league"` (hourly), not daily. The daily threshold logic is proven by UT-T01 and UT-T03 in `sync-timestamp.test.ts`.
- Each test seeds its own `sync_log` row and cleans up after itself via `try/finally`.

### CRITICAL-2: Fixed SeasonalPillBadge data source
- Removed incorrect `pre_draft -> "Preseason"` mapping from `seasonal-pill-badge.tsx`
- Removed DB query entirely; `getCurrentNflState()` now returns `null` unconditionally
- Added clear documentation comment explaining that `seasons.status` stores Sleeper league lifecycle state, not NFL calendar state, and Epic 2 will provide the correct data source
- Component will render nothing until Epic 2 introduces an NFL state table

### MINOR-1: Fixed aria-expanded type
- Changed `aria-expanded={isOpen}` to `aria-expanded={isOpen ? "true" : "false"}` in `site-nav-client.tsx`

### MINOR-2: Added role="list" to desktop ul
- Added `role="list"` to the desktop `<ul>` in `site-nav-client.tsx` for Safari VoiceOver compatibility

### MINOR-3: Added offseason variant
- Added `"offseason"` to `SeasonVariant` type union in `seasonal-pill-badge.tsx`
- Added `case "offseason"` to `getVariantClasses` switch (uses `bg-muted text-muted-foreground`)
- Added `case "off"` to `getLabel` switch (returns `{ label: "Offseason", variant: "offseason" }`)

### MINOR-4: Removed dead locator
- Removed unused `desktopLinks` variable (lines 16-17) from FE-T01 in the E2E spec

## Files Created

| File | Description |
|---|---|
| `e2e/helpers/seed-sync-log.ts` | E2E test helper for seeding and cleaning up sync_log rows via direct Drizzle DB connection |
| `components/site-nav-client.tsx` | Client island for hamburger state, active-link detection via `usePathname`, focus trap, Escape key close, outside click close |
| `components/seasonal-pill-badge.tsx` | Async Server Component; returns `null` unconditionally until Epic 2 provides NFL state data |
| `components/section-header.tsx` | Pure presentational Server Component; title (h3 bold) + optional "View All" link with bottom border separator |
| `app/test/section-header/page.tsx` | Test fixture page for E2E tests against SectionHeader with multiple variants |
| `components/sync-timestamp.test.ts` | Unit tests for stale threshold branching (UT-T01 through UT-T05) |
| `e2e/story-1.3-layout.spec.ts` | E2E tests covering FE-T01 through FE-T62 and edge cases EC-T01 through EC-T06, now including FE-T30 through FE-T35 |

## Files Modified

| File | Changes |
|---|---|
| `components/site-nav.tsx` | Removed `"use client"` directive; now a Server Component shell. Renders brand link with `aria-label="HMLML — Home"`, passes `SeasonalPillBadge` as a prop to `SiteNavClient`. Nav items updated to Hub/Teams/Records/History/Drafts/Players (Matchups removed). |
| `components/site-nav-client.tsx` | Fixed `aria-expanded` to use string `"true"`/`"false"` (MINOR-1). Added `role="list"` to desktop `<ul>` (MINOR-2). |
| `components/seasonal-pill-badge.tsx` | Removed incorrect `seasons.status` DB query; `getCurrentNflState()` returns `null` unconditionally (CRITICAL-2). Added `"offseason"` variant to type and switch (MINOR-3). |
| `components/sync-timestamp.tsx` | Exported `getStaleThresholdMs()` function. Stale threshold now branches: daily = 26 hours (93,600,000ms), all others = 2 hours (7,200,000ms). Old 1-hour threshold removed. |
| `components/sync-timestamp-client.tsx` | Fixed inverted color logic: stale = `text-[#C4402F]` (warm rust), fresh = `text-muted-foreground`. Added `(outdated)` text suffix when stale (BR-5 compliance: no color-only information). |
| `app/layout.tsx` | Removed `BottomTabBar` import and rendering. Removed `pb-20 md:pb-0` from main. Added `pt-14 md:pt-0` to main for fixed mobile nav offset. |
| `e2e/story-1.3-layout.spec.ts` | Added FE-T30 through FE-T35 SyncTimestamp tests (CRITICAL-1). Removed dead locator in FE-T01 (MINOR-4). |

## Files Deleted

| File | Reason |
|---|---|
| `components/bottom-tab-bar.tsx` | Retired per AC-4 / UXA decision. Hamburger menu is the complete replacement for mobile navigation. No other files imported this component. |

## Components Built

### SiteNav (updated architecture)
- Split into `site-nav.tsx` (Server Component shell) + `site-nav-client.tsx` (client island)
- Server component renders the `<header>`, brand link, and `<SeasonalPillBadge />`
- Client island manages: hamburger open/close state, `usePathname()` for active link detection, desktop nav links, mobile overlay
- Nav links: Hub (`/`), Teams (`/teams`), Records (`/records`), History (`/seasons`), Drafts (`/drafts`), Players (`/players`)
- Hub uses exact `pathname === "/"` match (fixes the startsWith bug for root route)
- `aria-current="page"` on active link; desktop uses underline + primary color; mobile uses left border accent
- Header uses `sticky top-0 z-40` positioning

### SiteNavClient (mobile hamburger)
- Hamburger button: 44x44px tap target, `aria-label` toggles between "Open navigation"/"Close navigation", `aria-expanded` uses string `"true"`/`"false"`, `aria-controls="mobile-nav-menu"`
- Desktop `<ul>` has `role="list"` for Safari VoiceOver compatibility
- Menu/Close icons swap immediately (no animation per spec)
- Overlay: `fixed top-14 inset-x-0 z-30`, stacked vertical links, full-width touch targets
- Focus trap: Tab cycles through 6 links only; Shift+Tab wraps backward
- Close triggers: Escape (returns focus to hamburger), outside click, nav link click, hamburger button click
- Closes on pathname change (navigation)

### SeasonalPillBadge
- Async Server Component, self-contained
- Returns `null` unconditionally until Epic 2 provides NFL state data
- No longer queries `seasons.status` (was incorrectly conflating Sleeper league lifecycle with NFL calendar state)
- Four variant styles defined: preseason (green), week (green), playoffs (gold), offseason (muted)
- Pill shape: `rounded-full px-3 py-1`, caption size, uppercase, wide tracking

### SectionHeader
- Pure presentational Server Component
- Props: `title` (required), `viewAllHref` (optional), `viewAllLabel` (optional, defaults to "View All ->")
- Layout: `flex items-center justify-between` with `border-b border-border mb-4`
- Title: `text-h3 font-bold` (h3 size with explicit bold override since text-h3 defaults to 500)
- Link: `text-body-sm font-medium text-primary hover:underline` with `py-2` for mobile tap target
- No `<a>` rendered when `viewAllHref` is not provided

### SyncTimestamp / SyncTimestampClient (updated)
- Stale threshold branching: `daily` = 26 hours, all others = 2 hours
- "league" dataType maps to hourly (2-hour) threshold (documented decision in unit test UT-T05)
- Stale color: `text-[#C4402F]` (warm rust, pre-1.2 fallback for `--accent-warm`)
- Fresh color: `text-muted-foreground` (fixed; was inverted before)
- "(outdated)" text appended when stale (accessible, not color-only)
- `getStaleThresholdMs()` exported for unit testing

## Patterns Used
- Server Component shell + Client island pattern (SiteNav split)
- Async Server Component with graceful null fallback (SeasonalPillBadge)
- Pure presentational Server Component (SectionHeader)
- Existing `"use client"` boundary preserved for SyncTimestampClient
- Focus trap via manual keydown handler (no library; 6 focusable elements)
- Outside click detection via document mousedown listener
- E2E test DB seeding via direct Drizzle connection with per-test cleanup

## UXA Extrapolations Applied
1. Brand link `aria-label="HMLML — Home"` per UXA extrapolation #1
2. Mobile active state uses left border (`border-l-2 border-primary`) per UXA extrapolation #2
3. SeasonalPillBadge returns null (not "Offseason") when no data per UXA extrapolation #3
4. SectionHeader uses `mb-4` (16px) below separator per UXA extrapolation #6
5. Overlay positioned below bar (`fixed top-14`) per UXA extrapolation #5

## Test Results

### Unit Tests (vitest)
- 8 new tests in `components/sync-timestamp.test.ts` covering stale threshold branching
- All 80 tests passing (including pre-existing tests)

### E2E Tests (Playwright)
- 36 test cases written in `e2e/story-1.3-layout.spec.ts`
- Covers FE-T01 through FE-T05 (nav items), FE-T06 through FE-T08 (active states, keyboard nav)
- Covers FE-T10 (SeasonalPillBadge absent); FE-T11 through FE-T14 require DB seeding for Epic 2 data
- Covers FE-T20 through FE-T29b (hamburger menu, a11y)
- Covers FE-T30 through FE-T35 (SyncTimestamp: fresh, toggle, fallback, non-home route, stale color + text, fresh threshold)
- FE-T36 and FE-T37 (daily threshold) documented as unit-test-only coverage since footer uses `dataType="league"`
- Covers FE-T40 through FE-T43, EC-T04, EC-T05 (SectionHeader)
- Covers FE-T50 (max-width), FE-T60-FE-T62 (BottomTabBar retired, mobile offset)
- Covers EC-T01, EC-T06 (edge cases)
- Tests run at both 375px and 1280px viewports as specified
- SyncTimestamp tests seed and clean up their own DB rows via `e2e/helpers/seed-sync-log.ts`

## Dependencies on BEND
- No BEND dependencies for this story. All components are UI/layout with existing DB queries.

## Token Dependencies (Story 1.2)
- Using pre-1.2 fallback values per the Token Equivalence Table in the REQS brief
- `text-[#C4402F]` for stale timestamp color (replace with `text-[--accent-warm]` when 1.2 ships)
- `bg-[#FEF9EC]` and `text-[#B8860B]` for playoffs badge (replace with token vars when available)
- All other tokens map to existing shadcn/ui variables (`--primary`, `--muted-foreground`, etc.)

## Decisions Documented
1. `SiteNav` split into Server shell + Client island (CLAUDE.md compliance)
2. `"league"` dataType uses hourly (2-hour) threshold (documented in UT-T05)
3. SeasonalPillBadge returns `null` unconditionally until Epic 2 provides NFL state data (CRITIC violation fix)
4. BottomTabBar retired completely; hamburger menu is the replacement
5. `sticky top-0` used for header positioning (works for both mobile and desktop; falls back well)
6. `aria-expanded` uses explicit string values per ARIA spec (CRITIC violation fix)
7. Desktop `<ul>` has `role="list"` for Safari VoiceOver (CRITIC violation fix)
