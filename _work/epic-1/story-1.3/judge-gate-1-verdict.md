---
## Orchestrator Summary
- **Agent**: JUDGE Gate 1
- **Story**: 1.3 — Core Layout Components
- **Verdict**: APPROVED
- **State transition**: qa-plan-complete -> judge-g1-approved
- **Flags for orchestrator**:
  1. Three gaps identified below are ADVISORY — each is tolerable given the story's scope, but QA Phase B must address them during execution. They do not rise to REJECT level because they are edge cases or implementation-contingent behaviors, not missing coverage of core ACs.
  2. The existing `e2e/navigation.spec.ts` file must be reviewed by QA Phase B per the QA Phase A flag. This is not a test plan deficiency but a pre-existing test maintenance issue.
  3. The SectionHeader tests (FE-T40 through FE-T43) carry meaningful risk: they depend on the implementor adding `<SectionHeader>` to at least one page. If no such page is used in Story 1.3 and the implementor only creates the component without wiring it up, these tests either cannot run or will test a synthetic route that proves nothing about real integration. QA Phase B must confirm placement before running.
---

# JUDGE Gate 1 Verdict: Story 1.3 — Core Layout Components

## Ruling: APPROVED

The test plan is thorough enough to proceed to implementation and execution. The coverage is systematic, the ARIA/accessibility tests are precise, and the stale threshold tests are written with correct boundary values (not off-by-one). The PMCP visual checklist is comprehensive. No AC clause is entirely untested. There are three advisory gaps that QA Phase B must address but that do not warrant a full rewrite of the plan.

---

## AC Coverage Audit

### AC-1: Persistent top nav — Hub, Teams, Records, History, Drafts, Players in order
- **FE-T01**: Verifies exactly 6 items in order on desktop. COVERED.
- **FE-T02**: Verifies nav present on every listed route. COVERED.
- **FE-T03**: Verifies all 6 `href` values are correct. COVERED.
- **Assessment**: Full coverage. The exact-order check in FE-T01 (DOM order assertion) is the right mechanism.

### AC-2: "HMLML" brand text on the left
- **FE-T04**: Verifies text present, links to `/`, appears before nav links in DOM. COVERED.
- **Assessment**: Adequate. One minor weakness: FE-T04 asserts the brand text "appears before nav links in DOM order" but does not explicitly verify it is visually positioned to the LEFT (flex layout could render DOM order differently than visual order if `order` CSS is misused). This is an edge case and acceptable at this fidelity.

### AC-3: Seasonal Pill Badge (Preseason/Week N/Playoffs/Offseason)
- **FE-T10**: Badge absent when DB empty. COVERED.
- **FE-T11**: Preseason badge text, shape, and color. COVERED.
- **FE-T12**: Regular season "Week N" with number interpolation. COVERED.
- **FE-T13**: Playoffs badge with gold styling. COVERED.
- **FE-T14**: Badge present in mobile top bar. COVERED.
- **EC-T02**: Two-digit week number does not truncate. COVERED.
- **EC-T03**: Badge is non-interactive (not in tab order). COVERED.

**ADVISORY GAP #1 — "Offseason" variant:** The UXA spec explicitly notes the offseason variant (`bg-muted text-muted-foreground`) as a defined variant with specific styling. The test plan explicitly excludes this (see "What Is NOT Tested" item 4: "SeasonalPillBadge 'Offseason' variant"). The justification is that this story's decision is to return `null` (not show Offseason). This is documented and is the implementor's stated intent. The gap is acceptable IF the implementation indeed returns `null`. If the implementor chooses to show an Offseason pill (permitted by the UXA spec as an explicit alternative), this variant goes completely untested. **QA Phase B must confirm the implementor's decision during execution and, if Offseason pill is rendered, add a test for it before sign-off.**

### AC-4: Mobile hamburger, fixed bar, does not scroll away
- **FE-T20**: Fixed bar stays at top after scrolling. COVERED.
- **FE-T21**: Desktop nav hidden on mobile; hamburger visible. COVERED.
- **FE-T22**: Opens overlay with correct items, X icon, aria-expanded=true. COVERED.
- **FE-T23**: Closes on second click, reverts to three-lines, aria-expanded=false. COVERED.
- **FE-T24**: Closes on outside click. COVERED.
- **FE-T25**: Escape closes and returns focus to hamburger. COVERED.
- **FE-T26**: Focus trap wraps forward (Tab from last -> first). COVERED.
- **FE-T27**: Focus trap wraps backward (Shift+Tab from first -> last). COVERED.
- **FE-T28**: Clicking a nav link navigates and closes overlay. COVERED.
- **FE-T29**: ARIA in closed state (aria-label, aria-expanded, aria-controls). COVERED.
- **FE-T29b**: ARIA in open state. COVERED.
- **FE-T62**: `main` has `pt-14` on mobile, `0` on desktop. COVERED.

**Assessment**: Hamburger accessibility coverage is the strongest section of this plan. Focus trap forward AND backward are explicitly tested. Escape key, outside click, aria-controls, aria-expanded, icon swap — all tested. This is the level of rigor I expect.

### AC-5: Sync Timestamp — last sync time in footer
- **FE-T30**: Fresh timestamp in footer with relative time. COVERED.
- **FE-T31**: Toggle shows/hides absolute time. COVERED.
- **FE-T32**: Fallback text when no sync record. COVERED.
- **FE-T33**: Timestamp in footer on non-home route. COVERED.

### AC-5 (stale behavior): Warm color + "(outdated)" text when stale
- **FE-T34**: Hourly data stale at >2hr: warm color + "(outdated)" text + accessibility assertion. COVERED.
- **FE-T35**: Hourly data fresh at 1h59m: no stale indicators. COVERED.
- **FE-T36**: Daily data stale at >26hr. COVERED (with correct conditional note about dataType usage).
- **FE-T37**: Daily data fresh at 25hr. COVERED.
- **UT-T01 through UT-T05**: Threshold logic verified at boundary values. COVERED.

**Assessment**: The QA Phase A flag about the inverted class logic is noted and the tests (FE-T34, FE-T35) explicitly assert on computed color values rather than class names, which is the correct approach given the known inversion bug. The instruction to check computed color `rgb(196, 64, 47)` in FE-T34 is the right call. UT-T05 for the "league" default is a pragmatic ambiguity trap.

### AC-6: Section Header component
- **FE-T40**: Title-only renders h3, no link, separator. COVERED.
- **FE-T41**: With viewAllHref renders default "View All →" link right-aligned. COVERED.
- **FE-T42**: With custom viewAllLabel renders custom text. COVERED.
- **FE-T43**: "View All" link keyboard focusable with visible ring. COVERED.
- **EC-T04**: Title-only: no empty `<a>` tag in DOM. COVERED.
- **EC-T05**: Long title mobile layout does not overflow. COVERED.

**ADVISORY GAP #2 — SectionHeader page placement dependency**: Tests FE-T40 through FE-T43 require the component to be rendered on a real page. The test plan acknowledges this ("implementor must add an example usage to at least one page") but leaves it as an open dependency. If the implementor only creates the component and does not place it on any page in Story 1.3, these tests cannot run meaningfully. A synthetic test route is listed as an alternative but is explicitly weaker. **QA Phase B must resolve this before executing: confirm which page(s) use `<SectionHeader>` in Story 1.3, or coordinate with the implementor to add a demo instance to the home page or hub layout. Do not run these tests against a stub test route.**

### AC-7: Root layout 1200px max-width
- **FE-T50**: Content constrained to 1200px, centered, tested at 1600px viewport. COVERED.
- **Assessment**: Adequate. The viewport choice (1600px, wider than the constraint) is correct test design.

### BR-2: Matchups not a nav item
- **FE-T01, FE-T02, FE-T05**: All assert no "Matchups" text in nav. COVERED.
- **PMCP visual checklist**: Also covers "No Matchups link visible anywhere in the nav." COVERED.

### BR-5: No color-only stale information
- **FE-T34**: Asserts "(outdated)" text is in the accessible text node (not hidden). COVERED. The explicit check that `aria-hidden` is not applied to this text is well-designed.

### BR-6: Hamburger accessibility (aria-label, aria-expanded, focus trap, Escape)
- Fully covered across FE-T22, FE-T23, FE-T25, FE-T26, FE-T27, FE-T29, FE-T29b.

### BR-7: Hub active state is exact pathname === "/"
- **FE-T07**: Hub not active on /teams. COVERED.
- **EC-T01**: Hub not active on /teams/some-franchise-id. COVERED.

### BottomTabBar retired
- **FE-T60**: Not rendered on home or /teams. COVERED.
- **FE-T61**: `main` does not have pb-20 padding. COVERED.

---

## UI Behavior Coverage

All defined state transitions in the UXA spec are tested:

| State | Test |
|---|---|
| Hamburger closed -> open (icon, aria, focus) | FE-T22 |
| Hamburger open -> closed via button (icon, aria) | FE-T23 |
| Hamburger open -> closed via Escape + focus return | FE-T25 |
| Hamburger open -> closed via outside click | FE-T24 |
| Hamburger open -> closed via nav link click + navigate | FE-T28 |
| Focus trap Tab wraps forward | FE-T26 |
| Focus trap Shift+Tab wraps backward | FE-T27 |
| SyncTimestamp toggle show absolute | FE-T31 |
| SyncTimestamp toggle hide absolute | FE-T31 (continuation) |
| Fresh -> stale rendering | FE-T34, FE-T35 |
| SeasonalPillBadge variants | FE-T10 through FE-T14 |

The UXA spec's `[initial server render -> hydration flash]` extrapolation is correctly noted as intentionally untested. Acceptable.

**ADVISORY GAP #3 — Brand link aria-label not tested**: The UXA spec includes an accessibility checklist item `aria-label="HMLML — Home"` on the brand link. This is marked as `[UXA EXTRAPOLATION]` in the spec. No test verifies this attribute. The plan tests that the brand link exists (FE-T04) and links to `/` but does not test its accessible name for screen reader users. The reqs brief does not list this as a formal BR, making it a gap in extrapolation coverage rather than an AC violation. **QA Phase B should add a single assertion in FE-T04 that checks for a non-empty aria-label on the brand link. It is a one-line add to an existing test.**

---

## Database State Verification

The story has no schema migrations and no write paths. All DB interaction is read-only (SeasonalPillBadge query, SyncTimestamp query).

- FE-T11/T12/T13/T14: Require seeding NFL state data. Seed data spec is listed per test. Acceptable.
- FE-T30/T31/T32/T33/T34/T35/T36/T37: Require seeding `sync_log`. Seed data spec is precise (job_type, completed_at with specific intervals). Acceptable.
- FE-T10, FE-T32: Explicitly test empty-DB degradation. Correct.

The QA Phase A flag about SeasonalPillBadge DB seed requirements (Flag #3 in the plan header) is valid. The test plan appropriately defers exact table/column confirmation to Phase B and specifies it as a coordination item with the implementor. This is honest about an unknown rather than papering over it.

---

## Data Isolation

Each test specifies its own seed data. The plan states "No shared state between tests." Playwright's per-test DB seeding is implied. This is sufficient.

No mutation paths exist in this story, so isolation concerns are limited to read-state accuracy. The different `completed_at` values between FE-T30/T31/T34/T35 are meaningfully distinct (10 min ago, 30 min ago, 3 hours ago, 119 min ago). No ambiguity.

---

## Authorization Tests

Phase 1 is fully public. SI-T01 covers the basic sanity check (all routes render in incognito/fresh session). No auth surfaces exist. This is adequate.

---

## Edge Case Coverage

| Edge Case | Test |
|---|---|
| Hub active rule exact match (regression guard) | FE-T07 |
| Hub active rule on deep route | EC-T01 |
| Two-digit week number (week 18) | EC-T02 |
| Badge non-interactive in tab order | EC-T03 |
| SectionHeader title-only: no orphan `<a>` | EC-T04 |
| Long SectionHeader title mobile overflow | EC-T05 |
| Hamburger icon accessible with no visible text | EC-T06 |
| Stale boundary condition (1h59m exactly) | FE-T35 |
| Daily fresh boundary (25 hours) | FE-T37 |

Edge case coverage is strong. The boundary-value tests (FE-T35, FE-T37) at exactly threshold-minus-one-minute are the right design.

---

## Test Independence

Confirmed: each test specifies independent seed data. No cross-test dependencies identified. The `"use client"` nature of the hamburger component means some tests involve client-side state, but Playwright handles this correctly by navigating fresh per test. No issues.

---

## Accessibility-Specific Review

This is the section I scrutinize hardest for this story, given the hamburger focus trap and ARIA requirements.

**Focus trap — forward (FE-T26):** Correct. Tests Tab from first link through all 6, then wraps back to first. The step-by-step Tab count (Tab x5 to reach last, Tab x1 from last to wrap) is precise.

**Focus trap — backward (FE-T27):** Correct. Tests Shift+Tab from first link wraps to last. Tests that focus does NOT reach elements behind the overlay.

**Escape key + focus return (FE-T25):** Correct. Verifies `document.activeElement` is the hamburger button after Escape. This is the right assertion mechanism.

**aria-expanded (FE-T22, FE-T23, FE-T29, FE-T29b):** Tested in both states with explicit attribute value assertions. Correct.

**aria-controls (FE-T29):** Checks that the attribute exists AND that the referenced element ID exists in DOM. This is the correct two-part assertion (attribute present + target valid). Correct.

**aria-current="page" (FE-T06):** Tests that active link has the attribute AND that no other link has it on the same route. This bi-directional check is the right design — it prevents a regression where every link gets `aria-current`.

**No color-only information (FE-T34):** Explicitly checks that "(outdated)" is in the accessible text node, not hidden via aria-hidden or visibility:hidden. This is the right assertion.

**Mobile tap target (44px):** The PMCP checklist includes this for hamburger button and nav links. Not Playwright-testable at pixel level, so human review is the correct placement. Acceptable.

**Identified miss:** No test verifies that `<nav aria-label="Main navigation">` itself has the correct `aria-label` value. FE-T01 through FE-T07 all reference `<nav aria-label="Main navigation">` as a locator, which means if the nav lacks this label the Playwright selector itself will fail — this is an implicit test of the attribute. The test would fail (test error, not assertion failure), making the gap self-enforcing. Acceptable.

---

## PMCP Checklist Assessment

The visual checklist at the end of the test plan is comprehensive. Highlights that require human review because Playwright cannot reliably verify them:

- Backdrop-blur effect on nav bar
- Pill badge rounded-pill shape vs square
- Active link underline + green text both present simultaneously
- Overlay background color (cream vs white)
- 48px stacked link tap height visually
- Arrow character rendering (not a box/missing glyph)
- Warm rust vs true red distinction (critical for the color blindness rule)

These are all correctly placed in the manual checklist rather than automated tests. The plan is self-aware about what Playwright can and cannot reliably assert.

---

## Summary of Advisory Gaps (Non-Blocking)

| Gap | Severity | Required Action |
|---|---|---|
| GAP #1: Offseason badge variant untested | ADVISORY | QA Phase B must confirm implementor's null-return decision. If Offseason pill is rendered, add test before sign-off. |
| GAP #2: SectionHeader tests depend on real page usage | ADVISORY | QA Phase B must confirm placement before executing FE-T40 through FE-T43. Do not test against stub route. |
| GAP #3: Brand link aria-label not asserted | ADVISORY | QA Phase B should add one assertion to FE-T04 checking aria-label on brand link. |

None of these gaps cover a formally stated AC, BR, or NFR at a level that warrants plan rejection. The plan is approved to proceed to implementation and QA Phase B execution.

---

## Final Ruling

**APPROVED.** The 43-test plan covers all ACs, all BRs, the full accessibility matrix, and the BottomTabBar retirement verification. Focus trap coverage (forward, backward, Escape, outside-click) is complete. Stale threshold boundary conditions are correctly designed. The plan is honest about what it cannot test automatically (iOS Safari, Offseason variant, contrast precision) and places those items in the correct manual review category.

QA Phase B proceeds with the three advisory gaps noted above as explicit pre-execution checklist items.
