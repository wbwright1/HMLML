---
## Orchestrator Summary
- **Agent**: QA Phase A
- **Story**: 1.3 — Core Layout Components
- **Verdict**: COMPLETE
- **State transition**: uxa-complete -> qa-plan-complete
- **Flags for orchestrator**:
  1. The existing `e2e/navigation.spec.ts` tests `/matchups` as a valid route; once Story 1.3 removes Matchups from the nav, that test will still pass (the route itself is not removed) but the test description will be stale. QA Phase B should update that file to remove the `/matchups` route test or clarify its intent.
  2. SyncTimestamp stale color fix inverts the current class logic. QA Phase B must verify the class names on the actual DOM element, not just that the component renders. The old bug was `isStale ? "text-muted-foreground"` (stale = muted), which is backwards. The test must assert the warm rust class is present when stale, absent when fresh.
  3. SeasonalPillBadge will render nothing against an empty DB (this is correct behavior per the UXA decision). Tests verifying the badge rendering variants require seeding the DB with NFL state data. Confirm with the implementor how the DB is seeded for E2E tests targeting badge variants.
---

# QA Test Plan: Story 1.3 — Core Layout Components

## Test Strategy

Story 1.3 is almost entirely UI/layout with no new API endpoints and no schema migrations. All test cases are E2E tests run via Playwright against a real running Next.js dev server connected to a real Postgres database. No mocks. No stubs. No unit tests for UI components (they have no logic worth testing in isolation; the behavior is only meaningful at the rendered-page level).

Two exceptions where narrow unit tests are appropriate:
- The stale threshold calculation in `sync-timestamp.tsx` (pure function with no dependencies)
- The `getRelativeTime` helper function in the same file (pure utility)

All other test cases are Playwright E2E.

**Viewports tested at:**
- Mobile: 375px wide x 812px tall (iPhone SE / standard narrow viewport)
- Desktop: 1280px wide x 800px tall

**Running dev server URL:** `http://localhost:3000`

**DB seed requirements:** Each test case specifies its own seed data. No shared state between tests.

---

## AC Coverage Matrix

| AC | Description | Test IDs |
|---|---|---|
| AC-1 | Nav shows exactly Hub, Teams, Records, History, Drafts, Players in that order | FE-T01, FE-T02, FE-T03 |
| AC-2 | Nav shows "HMLML" brand text on the left | FE-T04 |
| AC-3 | Nav shows SeasonalPillBadge (Preseason / Week N / Playoffs / Offseason) | FE-T10, FE-T11, FE-T12, FE-T13, FE-T14 |
| AC-4 | Nav collapses to hamburger on mobile; fixed bar does not scroll away | FE-T20, FE-T21, FE-T22, FE-T23, FE-T24, FE-T25 |
| AC-5 | SyncTimestamp in footer shows last sync time | FE-T30, FE-T31, FE-T32, FE-T33 |
| AC-5 (stale) | SyncTimestamp shows warm color + "(outdated)" text when stale | FE-T34, FE-T35 |
| AC-6 | SectionHeader renders with title only and with View All link | FE-T40, FE-T41, FE-T42, FE-T43 |
| AC-7 | Root layout content max-width 1200px on desktop | FE-T50 |
| BR-2 | Matchups is NOT a nav item | FE-T05 |
| BR-5 | Stale state is not color-only; "(outdated)" text present | FE-T34 |
| BR-6 | Hamburger a11y: aria-label, aria-expanded, focus trap, Escape | FE-T22, FE-T23, FE-T24, FE-T25 |
| BR-7 | Hub active rule is exact pathname === "/" (no startsWith) | FE-T07 |
| BottomTabBar retired | Component is no longer rendered anywhere | FE-T60 |
| Keyboard nav | Tab through desktop nav, Escape closes mobile menu | FE-T08, FE-T25 |
| Unit: stale threshold | Threshold branching logic for daily vs hourly | UT-T01, UT-T02, UT-T03 |

---

## Unit Tests (UT-T*)

These are the only unit tests permitted. Co-located with source at `components/sync-timestamp.test.ts`.

### UT-T01: Hourly data type — stale threshold is 2 hours

**Seed data:** None (pure function test).

**Input:** `dataType = "hourly"`, `diffMs = 7_200_001` (2 hours + 1ms)

**Expected:** `isStale === true`

**Notes:** Verify the threshold is 7,200,000ms (2 hours exactly), not the old 3,600,000ms (1 hour).

### UT-T02: Hourly data type — not stale within 2 hours

**Seed data:** None.

**Input:** `dataType = "hourly"`, `diffMs = 7_199_999` (just under 2 hours)

**Expected:** `isStale === false`

### UT-T03: Daily data type — stale threshold is 26 hours

**Seed data:** None.

**Input:** `dataType = "daily"`, `diffMs = 93_600_001` (26 hours + 1ms)

**Expected:** `isStale === true`

### UT-T04: Daily data type — not stale within 26 hours

**Seed data:** None.

**Input:** `dataType = "daily"`, `diffMs = 93_599_999` (just under 26 hours)

**Expected:** `isStale === false`

### UT-T05: Default data type ("league") does NOT use the daily threshold

**Seed data:** None.

**Input:** `dataType = "league"` (the existing default), `diffMs = 7_200_001`

**Expected:** `isStale === true` (uses hourly 2-hour threshold, not daily 26-hour threshold; "league" is ambiguous but must map to one — implementor must document the decision and this test verifies it was made deliberately)

**Notes:** If implementor decides "league" maps to daily, this test inverts. Either answer is acceptable; the test verifies the decision was made intentionally and not left as the old 1-hour bug.

---

## E2E Tests (FE-T*)

All E2E tests use Playwright. Real server + real DB. No mocks.

---

### Nav Items and Order

#### FE-T01: Desktop nav renders exactly 6 items in correct order

**Viewport:** 1280x800

**Seed data:** None required (nav is static).

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate the `<nav aria-label="Main navigation">` element
3. Within the nav, find all visible nav link items (the `<ul>` on desktop)

**Assertions:**
- Exactly 6 link items are visible
- In DOM order, their text content is: `Hub`, `Teams`, `Records`, `History`, `Drafts`, `Players`
- No element with text "Matchups" exists in the nav

#### FE-T02: Nav items render on every route (not just home)

**Viewport:** 1280x800

**Seed data:** None.

**Steps:**
1. Navigate to each of the following routes in turn: `/teams`, `/records`, `/seasons`, `/drafts`, `/players`
2. On each page, locate the `<nav aria-label="Main navigation">` element

**Assertions (for each route):**
- All 6 nav items are present in correct order: Hub, Teams, Records, History, Drafts, Players
- No "Matchups" nav item present

#### FE-T03: Nav links href values are correct

**Viewport:** 1280x800

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate each nav link

**Assertions:**
- "Hub" link has `href="/"`
- "Teams" link has `href="/teams"`
- "Records" link has `href="/records"`
- "History" link has `href="/seasons"`
- "Drafts" link has `href="/drafts"`
- "Players" link has `href="/players"`

---

### Brand Text

#### FE-T04: HMLML brand text is present and links to /

**Viewport:** 1280x800

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate the brand text element in the nav

**Assertions:**
- An element with visible text "HMLML" is present inside the `<header>` or `<nav>`
- The element is a link (`<a>` or `<Link>`) with `href="/"`
- The element is to the left of the nav link list (appears before nav links in DOM order)

---

### Matchups Not in Nav

#### FE-T05: Matchups is not a nav item on any route

**Viewport:** 1280x800

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Check the nav for any link with text "Matchups"

**Assertions:**
- No element with text "Matchups" is present inside `<nav aria-label="Main navigation">`

---

### Active Link States

#### FE-T06: Active link has aria-current="page"

**Viewport:** 1280x800

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/teams`
2. Locate the "Teams" nav link

**Assertions:**
- The "Teams" nav link has attribute `aria-current="page"`
- No other nav link has `aria-current="page"` on this route
- The "Teams" link has visually distinct styling indicating active state (verify presence of primary color class or underline class — implementor's choice; the class must differ from inactive links)

#### FE-T07: Hub active state uses exact match — not active on /teams

**Viewport:** 1280x800

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/teams`
2. Locate the "Hub" nav link

**Assertions:**
- The "Hub" nav link does NOT have `aria-current="page"`
- The "Hub" link does NOT have the active visual treatment (primary color underline)

**Why this matters:** The old bug used `pathname.startsWith(href)`. For `href="/"`, this would match every route. This test guards against that regression.

---

### Keyboard Navigation (Desktop)

#### FE-T08: Desktop nav links are keyboard-focusable in order

**Viewport:** 1280x800

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Click the skip-to-content link area to position focus in the page
3. Tab backwards to reach the nav, OR: use `page.focus()` on the first nav link
4. Tab through all 6 nav links

**Assertions:**
- All 6 nav links receive visible focus state (ring or outline visible)
- Tab order matches visual order: Hub -> Teams -> Records -> History -> Drafts -> Players
- Each focused link has a visible 2px focus ring

---

### SeasonalPillBadge

#### FE-T10: Badge is absent when DB has no NFL state data

**Viewport:** 1280x800

**Seed data:** DB has no record that would populate NFL state (empty DB or no seasons/nfl_state row).

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate the `<nav aria-label="Main navigation">`

**Assertions:**
- No pill badge element is present inside the nav
- No element with text "Preseason", "Week", "Playoffs", or "Offseason" is present in the nav

#### FE-T11: Preseason badge renders correctly

**Viewport:** 1280x800

**Seed data:** Insert a record into the relevant DB table (confirmed with implementor) setting `season_type = "pre"`. The exact table and column names depend on implementor's DB schema choice.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate the pill badge in the nav

**Assertions:**
- A `<span>` element with text "PRESEASON" (uppercase) is visible in the nav
- The element has `rounded-full` class or equivalent pill shape
- The element has green-light background (verify computed background-color matches `bg-primary/10` approximation)
- The text color is forest green (`text-primary` / `#2D5A3D`)
- The badge is inside the `<header>` element

#### FE-T12: Regular season badge renders "Week N" with correct number

**Viewport:** 1280x800

**Seed data:** Insert a record setting `season_type = "regular"`, `week = 9`.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate the pill badge in the nav

**Assertions:**
- A `<span>` element with text "WEEK 9" (uppercase) is visible in the nav
- Background class is `bg-primary/10` (green-light)
- Text color is `text-primary` (forest green)

#### FE-T13: Playoffs badge renders correctly

**Viewport:** 1280x800

**Seed data:** Insert a record setting `season_type = "post"`.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate the pill badge

**Assertions:**
- Visible text is "PLAYOFFS" (uppercase)
- Background color is approximately `#FEF9EC` (gold-light)
- Text color is approximately `#B8860B` (antique gold)

#### FE-T14: Badge is present in mobile top bar as well

**Viewport:** 375x812

**Seed data:** Insert a record setting `season_type = "regular"`, `week = 5`.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate the fixed mobile top bar

**Assertions:**
- The pill badge is visible in the fixed top bar on mobile
- Text reads "WEEK 5" (uppercase)
- The badge appears to the left of the hamburger button (to the right of the brand text)

---

### Hamburger Menu — Basic

#### FE-T20: Mobile top bar is visible and does not scroll away

**Viewport:** 375x812

**Seed data:** None. Navigate to a page with enough content to scroll (home page or teams).

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Verify the top bar is visible at top of viewport
3. Scroll down 500px
4. Check that the nav bar is still visible at the top of the viewport

**Assertions:**
- The `<header>` is visible before scroll
- After scrolling, `header.getBoundingClientRect().top` is still 0 (or very close to 0)
- The nav bar height is 56px (`h-14`)
- The hamburger button is visible in the bar

#### FE-T21: Desktop nav is hidden on mobile; hamburger is shown

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`

**Assertions:**
- The desktop nav link list (`<ul>` with 6 links) is NOT visible on mobile (hidden via `md:hidden` equivalent, or simply not rendered)
- The hamburger button IS visible
- The hamburger button shows the three-lines icon (not the X icon) in closed state

#### FE-T22: Hamburger button opens the mobile overlay

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Verify the mobile overlay/dropdown is not visible
3. Click the hamburger button

**Assertions:**
- The mobile nav overlay becomes visible
- The overlay contains all 6 nav links: Hub, Teams, Records, History, Drafts, Players
- The hamburger button now shows the X icon (not three-lines)
- The hamburger button's `aria-expanded` attribute is `"true"`
- The hamburger button's `aria-label` is `"Close navigation"`
- The overlay is positioned below the top bar (not full-screen)

#### FE-T23: Hamburger button closes the overlay when clicked again

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Click the hamburger button to open the overlay
3. Click the hamburger button again (now showing X icon)

**Assertions:**
- The mobile nav overlay is no longer visible
- The hamburger button shows three-lines icon
- The hamburger button's `aria-expanded` is `"false"`
- The hamburger button's `aria-label` is `"Open navigation"`

#### FE-T24: Clicking outside the overlay closes it

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Click the hamburger button to open the overlay
3. Click on an area of the page outside the overlay and outside the top bar (e.g., the main content area)

**Assertions:**
- The mobile nav overlay is no longer visible
- The hamburger button's `aria-expanded` is `"false"`

---

### Hamburger Menu — Accessibility

#### FE-T25: Escape key closes the mobile overlay and returns focus

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Click the hamburger button to open the overlay
3. Verify focus is on the first nav link in the overlay
4. Press the Escape key

**Assertions:**
- The mobile nav overlay closes
- Focus returns to the hamburger button (verify with `document.activeElement`)
- The hamburger button's `aria-expanded` is `"false"`

#### FE-T26: Focus trap: Tab cycles within open overlay

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Click the hamburger button to open the overlay
3. Verify focus is on the first nav link (Hub)
4. Press Tab 5 times (through Teams, Records, History, Drafts, Players)
5. Press Tab one more time (from the last link, Players)

**Assertions:**
- After step 3: focus is on "Hub" link
- After step 4: focus is on "Players" link
- After step 5 (Tab from last link): focus returns to "Hub" link (focus trap wraps forward)
- At no point does focus leave the overlay and reach page content behind it

#### FE-T27: Focus trap: Shift+Tab wraps backward within open overlay

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Click the hamburger button to open the overlay
3. Focus is on "Hub" (first link)
4. Press Shift+Tab

**Assertions:**
- Focus moves to "Players" (last link) — wraps backward to the end of the focus trap
- Focus does not reach the hamburger button or any element behind the overlay

#### FE-T28: Clicking a nav link in the overlay navigates and closes the overlay

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Click the hamburger button to open the overlay
3. Click the "Teams" nav link in the overlay

**Assertions:**
- Browser navigates to `/teams` (URL changes)
- The mobile nav overlay is no longer visible after navigation

#### FE-T29: Hamburger button has correct ARIA attributes in closed state

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate the hamburger button (do not click it)

**Assertions:**
- `aria-label="Open navigation"`
- `aria-expanded="false"`
- `aria-controls` attribute is present and points to a valid element ID (the overlay container)
- The referenced element ID (e.g., `mobile-nav-menu`) exists in the DOM (even if hidden/empty in closed state)

#### FE-T29b: Hamburger button has correct ARIA attributes in open state

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Click the hamburger button

**Assertions:**
- `aria-label="Close navigation"`
- `aria-expanded="true"`
- The overlay container with the matching `id` is now present and visible

---

### SyncTimestamp

#### FE-T30: SyncTimestamp renders in the footer on every page

**Viewport:** 1280x800

**Seed data:** Insert one row into `sync_log` with `status = "success"`, `job_type = "hourly"`, `completed_at = NOW() - interval '10 minutes'`.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Scroll to the footer

**Assertions:**
- A timestamp element is visible in the `<footer>`
- The text contains "Last updated" and a relative time string (e.g., "10 minutes ago")
- The text does NOT contain "(outdated)"
- The text color is muted (not the warm rust color)

#### FE-T31: SyncTimestamp toggle shows absolute time on click

**Viewport:** 1280x800

**Seed data:** Insert one row into `sync_log` with `status = "success"`, `job_type = "hourly"`, `completed_at = NOW() - interval '30 minutes'`.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Scroll to the footer and locate the timestamp button
3. Click the timestamp button

**Assertions:**
- An absolute timestamp string appears below the relative time (formatted date and time)
- The absolute time is consistent with the seeded `completed_at` value

**Steps (continued):**
4. Click the timestamp button again

**Assertions:**
- The absolute timestamp is no longer visible

#### FE-T32: SyncTimestamp fallback renders when DB has no sync record

**Viewport:** 1280x800

**Seed data:** DB has no rows in `sync_log` (or no successful sync for the relevant data type).

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Scroll to footer

**Assertions:**
- The footer contains the text "Data may be outdated"
- No "(outdated)" suffix is present (the fallback text is distinct)

#### FE-T33: SyncTimestamp appears on a non-home route too

**Viewport:** 1280x800

**Seed data:** Insert one row into `sync_log` with `status = "success"`, `completed_at = NOW() - interval '5 minutes'`.

**Steps:**
1. Navigate to `http://localhost:3000/seasons`
2. Scroll to footer

**Assertions:**
- Timestamp element is present and shows "Last updated" relative time
- (Confirms the timestamp is in the shared layout footer, not just the home page)

---

### SyncTimestamp — Stale State

#### FE-T34: Hourly data stale after >2 hours: warm color + "(outdated)" text

**Viewport:** 1280x800

**Seed data:** Insert one row into `sync_log` with `status = "success"`, `job_type = "hourly"` (or the equivalent `dataType` value used by the footer's `<SyncTimestamp>` call), `completed_at = NOW() - interval '3 hours'`.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Scroll to footer and locate the timestamp element

**Assertions:**
- The visible text contains "Last updated" AND "(outdated)"
- The timestamp element (button or span) has a warm color applied. Verify by checking the computed color of the element is approximately `rgb(196, 64, 47)` (the `#C4402F` value). Not the muted gray color.
- The "(outdated)" text is part of the accessible text node (not hidden via `aria-hidden` or CSS `visibility: hidden`)
- This is NOT color-only information: the "(outdated)" text is present regardless of whether color is perceived

#### FE-T35: Hourly data fresh at 1h59m — no stale indicators

**Viewport:** 1280x800

**Seed data:** Insert one row with `completed_at = NOW() - interval '119 minutes'` (1 hour 59 minutes ago — just inside the 2-hour hourly threshold).

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Locate the timestamp in the footer

**Assertions:**
- The text "Last updated" is present
- The text does NOT contain "(outdated)"
- The element color is muted (NOT the warm rust color)

#### FE-T36: Daily data stale after >26 hours

**Viewport:** 1280x800

**Seed data:** Insert one row with `job_type = "daily"` and `completed_at = NOW() - interval '27 hours'`.

**Note:** This test only applies if the footer's `<SyncTimestamp dataType="daily" />` is called somewhere. If the footer only uses one `dataType`, substitute the appropriate value confirmed by the implementor. The test asserts the 26-hour threshold is used for daily data types, not the hourly 2-hour threshold.

**Steps:**
1. Ensure the footer is rendering a SyncTimestamp with `dataType` set to a daily type
2. Navigate to `http://localhost:3000/`

**Assertions:**
- The timestamp shows "(outdated)"
- Warm rust color is applied

#### FE-T37: Daily data fresh at 25 hours — no stale indicators

**Viewport:** 1280x800

**Seed data:** Insert one row with `job_type = "daily"`, `completed_at = NOW() - interval '25 hours'`.

**Assertions:**
- No "(outdated)" text
- Not warm rust color
- Confirms the daily threshold is 26 hours (not the old 1 hour, not the hourly 2 hours)

---

### SectionHeader Component

#### FE-T40: SectionHeader with title only renders correctly

**Viewport:** 1280x800

**Seed data:** The SectionHeader must be used somewhere on a page (implementor must add an example usage to at least one page for this test to be meaningful; if no page uses it yet, test the component in isolation via a dedicated test route or verify its usage in a story-provided demo).

**Steps:**
1. Navigate to any page that renders `<SectionHeader title="Recent Transactions" />` (no viewAllHref)
2. Locate the section header element

**Assertions:**
- An `<h3>` element is visible with text "Recent Transactions"
- No link element with "View All" text is present in the same header row
- A horizontal separator line (`border-b`) is visible below the header row
- The `<h3>` text is bold (font-weight 700, not 500)

#### FE-T41: SectionHeader with viewAllHref renders link with default label

**Viewport:** 1280x800

**Seed data:** Page renders `<SectionHeader title="Last Season's Best" viewAllHref="/records" />`.

**Steps:**
1. Navigate to the page
2. Locate the section header

**Assertions:**
- `<h3>` text is "Last Season's Best"
- A link with text "View All →" is visible on the right side of the header row
- The link's `href` is `/records`
- The link is visually to the right of the title (justify-between layout)
- The link text color is forest green (primary color, `#2D5A3D`)

#### FE-T42: SectionHeader with custom viewAllLabel renders that label

**Viewport:** 1280x800

**Seed data:** Page renders `<SectionHeader title="2024 Draft" viewAllHref="/drafts/2024" viewAllLabel="Full Draft →" />`.

**Assertions:**
- Link text is "Full Draft →" (not "View All →")
- Link href is `/drafts/2024`

#### FE-T43: SectionHeader "View All" link is keyboard focusable with visible ring

**Viewport:** 1280x800

**Seed data:** Page renders SectionHeader with `viewAllHref` set.

**Steps:**
1. Navigate to the page
2. Tab to the "View All →" link

**Assertions:**
- The link receives visible focus (2px ring using `--primary` color)
- The focus ring is visible against the page background (not invisible)

---

### Root Layout Max-Width

#### FE-T50: Content is constrained to 1200px max-width on wide desktop

**Viewport:** 1600x900 (wider than 1200px to see the constraint)

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Measure the width of the main content container (the element with `max-w-[1200px]`)

**Assertions:**
- The content container's computed width is 1200px (not 1600px or viewport-filling)
- The container is horizontally centered (equal left and right margins)
- Page content does not stretch edge-to-edge on a 1600px viewport

---

### BottomTabBar Retired

#### FE-T60: BottomTabBar is not rendered on any route

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Check for any fixed bottom navigation bar

**Assertions:**
- No element that was the BottomTabBar is present in the DOM
- No fixed-bottom nav-style element is visible at the bottom of the viewport
- Specifically: no element with class `fixed bottom-0` that contains nav links exists

**Steps (verify on another route):**
3. Navigate to `/teams`

**Assertions:**
- Same: no bottom tab bar on the teams route

#### FE-T61: main element does not have pb-20 bottom padding (BottomTabBar clearance removed)

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Inspect the `<main id="main-content">` element's computed padding-bottom

**Assertions:**
- Computed padding-bottom is 0px (or whatever the page content naturally requires; NOT the 80px/pb-20 that was added for the tab bar clearance)

---

### Mobile Content Offset

#### FE-T62: main element has pt-14 on mobile to offset fixed nav bar

**Viewport:** 375x812

**Seed data:** None.

**Steps:**
1. Navigate to `http://localhost:3000/`
2. Inspect `<main id="main-content">` computed padding-top
3. Inspect `<main id="main-content">` at viewport 1280x800

**Assertions:**
- At 375px viewport: `padding-top` is 56px (14 * 4px = 56px, the height of the fixed nav bar)
- At 1280px viewport: `padding-top` is 0px (no offset needed for sticky desktop nav)
- Page content is not hidden behind the fixed nav bar on mobile

---

## Security / Isolation Tests

No new API endpoints are introduced in this story. No authentication requirements. No data-mutation paths.

**SI-T01: Nav renders without any authenticated session**

Verify the nav and all its elements render identically with no session cookie. (All pages are public in Phase 1; this is a sanity check that no accidental auth gating was introduced.)

**Steps:** Navigate to all 6 nav routes in a fresh incognito browser profile.

**Assertions:** All pages render without redirects, errors, or missing nav elements.

---

## Edge Case Tests

#### EC-T01: Nav active state does not apply to Hub on /teams/some-franchise-id (deep route)

**Viewport:** 1280x800

Navigate to a deep route like `/teams/12345`. Assertions:
- "Teams" link has `aria-current="page"`
- "Hub" link does NOT have `aria-current="page"`
- (Confirms the `startsWith("/teams/")` rule for Teams, and exact `=== "/"` rule for Hub)

#### EC-T02: Week number with two digits renders without truncation

**Viewport:** 375x812

Seed data: `season_type = "regular"`, `week = 18`.

Assertions:
- Badge text is "WEEK 18" — the full two-digit week number is visible
- The pill does not overflow or clip the text

#### EC-T03: SeasonalPillBadge is not an interactive element

Navigate to any page where the badge renders. Use keyboard Tab to cycle through the nav.

Assertions:
- The pill badge `<span>` is NOT in the tab order (no `tabindex` attribute, no focus ring on it)
- It cannot be activated by keyboard or mouse as a button

#### EC-T04: SectionHeader title-only does not render an empty link element

Navigate to a page using `<SectionHeader title="Standings" />` (no viewAllHref).

Assertions:
- No `<a>` tag is present in the section header row
- DOM inspection: the header row contains only the `<h3>` (no hidden or empty link elements)

#### EC-T05: Long SectionHeader title does not break layout on mobile

**Viewport:** 375x812

Seed: A page renders `<SectionHeader title="All-Time Statistical Leaders and Records" viewAllHref="/records" />`.

Assertions:
- The title and link do not overlap
- Layout degrades gracefully: either the link wraps to a new line OR the title truncates; the layout does not overflow horizontally

#### EC-T06: Hamburger icon is accessible with no visible text label

**Viewport:** 375x812

Navigate to home. Locate the hamburger button.

Assertions:
- The button has a non-empty `aria-label` attribute
- The button's accessible name (from aria-label) is not empty or generic (must be "Open navigation" or "Close navigation")
- Screen reader tools (`aria-label` alone is sufficient since the icon is `aria-hidden`)

---

## PMCP Visual Checklist

These items cannot be machine-verified via Playwright. A human reviewer must visually confirm each during QA Phase B.

### Nav — Desktop (1280px)

- [ ] Nav bar height is visually 56px; not taller, not shorter
- [ ] "HMLML" brand text is at the far left of the nav bar
- [ ] Nav links are horizontally spaced with consistent gap (approximately 24px gap between items)
- [ ] Active link (current page) has green underline AND green text — both indicators visible simultaneously
- [ ] Inactive links are in muted warm gray, not pitch black
- [ ] SeasonalPillBadge (if rendered) is at the far right of the nav bar, after all nav links
- [ ] Pill badge shape is a rounded capsule (not a square badge)
- [ ] Nav bar has a subtle bottom border separating it from page content
- [ ] Nav bar background has frosted glass / slight blur effect (backdrop-blur-sm visible when scrolled over content)
- [ ] No Matchups link visible anywhere in the nav

### Nav — Mobile (375px), Closed State

- [ ] Fixed top bar is slim (56px), not tall
- [ ] "HMLML" brand text visible at left of the slim bar
- [ ] SeasonalPillBadge (if rendered) visible at right, before hamburger button
- [ ] Hamburger icon is three horizontal lines, clean and centered in its tap target
- [ ] No desktop nav link list visible on mobile

### Nav — Mobile (375px), Open State (hamburger pressed)

- [ ] Overlay renders directly beneath the fixed top bar (not a full-screen modal)
- [ ] Overlay background matches the nav bar background (cream/off-white, not white-white)
- [ ] Nav links stacked vertically with comfortable tap height (approximately 48px per link)
- [ ] Active link has left-border green accent (not underline)
- [ ] Inactive links have no accent; hover state shows subtle muted background
- [ ] Hamburger icon has changed from three-lines to X (close icon)
- [ ] All 6 links visible: Hub, Teams, Records, History, Drafts, Players
- [ ] No "Matchups" link

### SyncTimestamp — Fresh State

- [ ] Timestamp text is small/caption size; does not compete with page content visually
- [ ] Text color is muted/tertiary (warm gray, not black)
- [ ] Clock icon is visible and proportional to text size
- [ ] No "(outdated)" text visible when data is fresh

### SyncTimestamp — Stale State

- [ ] Text color is warm rust (#C4402F) — noticeably different from the fresh muted gray
- [ ] "(outdated)" text suffix is visible and readable
- [ ] The warm rust color does not look red-red or purple (verify against the color blindness rule)
- [ ] The "(outdated)" text is not hidden via screen-only CSS

### SectionHeader — Both States

- [ ] Title is bold (visibly heavier than body text, not just slightly thicker)
- [ ] Horizontal separator line spans full width of the component
- [ ] "View All →" link is green (primary / forest green), not black or muted
- [ ] "View All →" link is right-aligned, not center or left
- [ ] Arrow character → renders correctly (not a box or missing glyph)
- [ ] Spacing below the separator before content beneath it is approximately 16px

---

## What Is NOT Tested

1. **SeasonalPillBadge contrast ratios in CI** — The Playoffs variant (`#B8860B` on `#FEF9EC`) produces approximately 4.6:1 contrast. This is borderline and requires human visual verification and a browser-based contrast tool (axe DevTools, Chrome contrast checker). An automated Playwright color extraction is not reliable enough for this precision.

2. **iOS Safari sticky vs fixed nav behavior** — The UXA spec flags that CSS `sticky` may fail on mobile Safari due to scroll container quirks. This requires real device testing on iOS Safari; Playwright's WebKit engine does not fully replicate this behavior.

3. **Hydration flash of missing active state** — The brief server-render-then-hydrate gap where the active nav link has no visual treatment is noted as acceptable. No test covers it because it is intentional behavior, not a bug.

4. **SeasonalPillBadge "Offseason" variant** — The UXA decision is to return `null` when no data is available (not show "Offseason"). If a future decision changes this, a test must be added. For now, the "no badge" behavior is tested (FE-T10) but there is no test for an Offseason pill because it should never appear in this implementation.

5. **SyncTimestamp dataType "league" mapping** — The exact mapping of `"league"` to daily vs hourly threshold depends on the implementor's decision (UT-T05 covers it as a deliberate choice test but does not mandate a specific value). The correct behavior depends on what `job_type` values the sync pipeline actually writes to `sync_log`, which is an Epic 2 concern.

6. **SectionHeader heading level enforcement** — There is no automated test confirming `<h3>` is the correct heading level in the DOM hierarchy for every page that uses SectionHeader. This requires a manual accessibility audit post-Epic 2 when content pages exist.

7. **Existing `e2e/navigation.spec.ts` tests** — The existing test file includes `/matchups` in the route list. This route still exists; the test will still pass. However, it tests the route, not the nav. QA Phase B should evaluate whether to update or annotate that test.
