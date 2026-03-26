---
## Orchestrator Summary
- **Agent**: CRITIC
- **Story**: 1.3 — Core Layout Components (Re-Review after rejection)
- **Verdict**: APPROVED
- **State transition**: fend-complete -> critic-approved
- **Prior critical violations**: 2 — BOTH FIXED
- **Prior minor violations**: 4 — ALL FIXED
- **New violations found**: 0
- **Patterns tagged**: 3
---

# CRITIC Review: Story 1.3 — Core Layout Components (Re-Review)

## Verdict: APPROVED

All 6 violations from the prior review are confirmed fixed. No new violations were introduced by the fixes. The story is approved to proceed.

---

## Verification of Prior Violations

### VIOLATION-1 (CRITICAL): E2E tests for FE-T30 through FE-T37 — FIXED

**Prior state:** Zero SyncTimestamp E2E tests existed. The entire AC-5 block was untested.

**Current state:** The E2E file now contains a `SyncTimestamp` describe block covering FE-T30, FE-T31, FE-T32, FE-T33, FE-T34, and FE-T35. Each test seeds `sync_log` rows via the new `seed-sync-log.ts` helper, navigates the live app, and asserts on rendered DOM.

**Specific verification:**
- FE-T30: Seeds a sync 10 minutes ago, asserts "Last updated" text is present and "(outdated)" is absent, asserts color is NOT the warm rust `rgb(196, 64, 47)`. Correct.
- FE-T31: Seeds a sync 30 minutes ago, clicks the timestamp button, verifies the absolute time span appears, clicks again to collapse. Toggle flow verified.
- FE-T32: Calls `cleanupSyncLogByDataType("league")` to guarantee a clean state, then asserts the fallback `<span>` renders "Data may be outdated" and NOT a button. Correct.
- FE-T33: Seeds a sync 5 minutes ago, navigates to `/seasons` (non-home route), asserts timestamp button is visible. Confirms AC-5 applies on all pages.
- FE-T34: Seeds a sync 3 hours ago (beyond 2-hour hourly threshold), asserts "(outdated)" text is present AND computed color is exactly `rgb(196, 64, 47)`. This is the direct E2E proof that the stale color bug is fixed end-to-end, not just in unit tests. The "(outdated)" text is also asserted as visible (not hidden). This satisfies BR-5.
- FE-T35: Seeds a sync 119 minutes ago (just inside threshold), asserts "(outdated)" is absent and color is not warm rust. Boundary-value test is correct.

**FE-T36 and FE-T37 (daily threshold):** These are documented in the E2E file as comments explaining they are covered by unit tests (UT-T01 and UT-T03 in `sync-timestamp.test.ts`) because the footer renders `dataType="league"` (hourly), not a daily type. There is no rendered surface in this story that uses the daily threshold. The QA plan's own note for FE-T36 states "This test only applies if the footer's `<SyncTimestamp dataType="daily" />` is called somewhere." It is not. The unit tests for the daily threshold (`getStaleThresholdMs("daily")` returning 93,600,000ms) are sufficient. The comment in the spec file accurately explains the limitation. This is acceptable.

**The seeding helper (`e2e/helpers/seed-sync-log.ts`) uses Drizzle ORM**, connecting via `neon` + `drizzle-orm/neon-http` (the same pattern as `lib/db/index.ts`). It uses the `syncLog` table from the schema. No raw SQL. No mocks. This is correct.

**FIXED.** [VIOLATION-FIXED]

---

### VIOLATION-2 (CRITICAL): SeasonalPillBadge incorrect data source and mapping — FIXED

**Prior state:** The component queried `seasons.status` and mapped `pre_draft` to "Preseason," which is semantically incorrect. The `seasons.status` column stores Sleeper league lifecycle state, not NFL calendar state. The mapping conflated two different concepts.

**Current state:** `seasonal-pill-badge.tsx` now has `getCurrentNflState()` return `null` unconditionally with a code comment that explicitly explains why:

> "Currently returns null for ALL states because the seasons table only stores Sleeper league lifecycle status (pre_draft, in_season, complete), not NFL calendar state (pre, regular, post, off). These are different concepts. Epic 2 will introduce an NFL state data source with actual season_type and week columns. Until then, returning null is the correct fallback per UXA decision #3."

The DB query has been removed entirely from the component. The `SeasonalPillBadge` component body calls `getCurrentNflState()`, receives `null`, and returns `null`. No badge renders until Epic 2 provides real data. This matches UXA decision #3.

The `getLabel` function and `getVariantClasses` function remain correctly implemented for when Epic 2 data arrives: all four variants (`pre`, `regular`, `post`, `off`) map to the correct badge labels and styling. This is forward-compatible code, not dead code.

**FIXED.** [VIOLATION-FIXED]

---

### MINOR-1: `aria-expanded` typed as boolean — FIXED

**Prior state:** `aria-expanded={isOpen}` — JavaScript boolean, not a string.

**Current state:** Line 180 of `site-nav-client.tsx`: `aria-expanded={isOpen ? "true" : "false"}` — explicit string values.

**FIXED.** [VIOLATION-FIXED]

---

### MINOR-2: Desktop `<ul>` missing `role="list"` — FIXED

**Prior state:** The desktop `<ul>` lacked `role="list"`. The mobile overlay `<ul>` had it; the desktop one did not.

**Current state:** Line 149 of `site-nav-client.tsx`: `<ul className="hidden md:flex items-center gap-6" role="list">` — `role="list"` is now present on both the desktop and mobile `<ul>` elements.

**FIXED.** [VIOLATION-FIXED]

---

### MINOR-3: `SeasonalPillBadge` type union excluded `"offseason"` variant — FIXED

**Prior state:** `type SeasonVariant = "preseason" | "week" | "playoffs"` — missing `"offseason"`.

**Current state:** Line 1 of `seasonal-pill-badge.tsx`: `type SeasonVariant = "preseason" | "week" | "playoffs" | "offseason"` — all four variants from the spec are present. The `getVariantClasses` switch now includes a case for `"offseason"` returning `"bg-muted text-muted-foreground"`. The switch has no default case, which is correct: TypeScript's exhaustiveness will catch any unhandled variant at compile time.

**FIXED.** [VIOLATION-FIXED]

---

### MINOR-4: Dead locator on line 16 of E2E spec — FIXED

**Prior state:** `const desktopLinks = nav.locator(...)` was assigned and never used.

**Current state:** The E2E test file's FE-T01 test (lines 14-31) has no dead locator. The test goes directly to `const navUl = nav.locator("ul").first()` and uses it. The dead variable is gone.

**FIXED.** [VIOLATION-FIXED]

---

## What Continues to Pass (Unchanged, Re-Verified)

### Architecture: Server/Client Split
PASS. `site-nav.tsx` remains a Server Component with no `"use client"` directive. It imports `SiteNavClient` as a child and passes `<SeasonalPillBadge />` as a rendered ReactNode via the `pillBadge` prop. `site-nav-client.tsx` declares `"use client"`. The split is correct and unchanged.

### Nav Items and Order (AC-1, BR-1, BR-2)
PASS. `NAV_LINKS` in `site-nav-client.tsx` is exactly: Hub(`/`), Teams(`/teams`), Records(`/records`), History(`/seasons`), Drafts(`/drafts`), Players(`/players`). Matchups is absent. Order is correct.

### SyncTimestamp Stale Thresholds (BR-4)
PASS. `getStaleThresholdMs`: `"daily"` returns 93,600,000ms (26 hours); all others return 7,200,000ms (2 hours). Unchanged and correct.

### SyncTimestamp Color and Text Indicator (BR-5)
PASS. `isStale ? "text-[#C4402F]" : "text-muted-foreground"` and `{isStale && " (outdated)"}` — both present and correct in `sync-timestamp-client.tsx`.

### SyncTimestamp Fallback
PASS. When `getLatestSuccessfulSync` returns null or throws, the server component renders a `<span>` with "Data may be outdated." FE-T32 verifies this end-to-end.

### SectionHeader (AC-6)
PASS. `text-h3 font-bold` title, optional link with `text-body-sm font-medium text-primary hover:underline py-2`, `flex items-center justify-between pb-2 border-b border-border mb-4`. No changes were made; component remains correct.

### layout.tsx (AC-7)
PASS. `BottomTabBar` import absent. `pb-20` absent. `pt-14 md:pt-0` applied to `<main>`. `max-w-[1200px]` retained. No changes were made; layout remains correct.

### BottomTabBar Deletion
PASS. `components/bottom-tab-bar.tsx` does not exist. Glob search confirmed zero results.

### Unit Tests (UT-T01 through UT-T05)
PASS. No changes were made to `sync-timestamp.test.ts`. Still correct.

### Hamburger ARIA (BR-6)
PASS. Button has `aria-label={isOpen ? "Close navigation" : "Open navigation"}`, `aria-expanded={isOpen ? "true" : "false"}` (now string, per MINOR-1 fix), `aria-controls="mobile-nav-menu"`. Overlay has `id="mobile-nav-menu"`.

### E2E Seeding Helper
PASS. `e2e/helpers/seed-sync-log.ts` uses Drizzle ORM (`drizzle-orm/neon-http`), inserts via the `syncLog` schema table, returns the inserted row's `id` for teardown. Cleanup functions use `eq(syncLog.id, id)` and `eq(syncLog.dataType, dataType)` — both use Drizzle predicates, no raw SQL. The seeding adds a `startedAt` value derived from `completedAt - 5s`, which satisfies the `startedAt` not-null constraint on `sync_log`. This is correct.

---

## AC Coverage Assessment (Final)

| AC | Required Tests | Tests Written | Status |
|---|---|---|---|
| AC-1: Nav items and order | FE-T01, FE-T02, FE-T03 | FE-T01, FE-T02, FE-T03 | PASS |
| AC-2: Brand text | FE-T04 | FE-T04 | PASS |
| AC-3: SeasonalPillBadge | FE-T10 (others require Epic 2 data) | FE-T10 | PASS (Epic 2 dependency documented) |
| AC-4: Hamburger | FE-T20 through FE-T29b | All written | PASS |
| AC-5: SyncTimestamp | FE-T30 through FE-T37 | FE-T30 to FE-T35 (E2E); FE-T36, FE-T37 (unit test coverage, documented) | PASS |
| AC-6: SectionHeader | FE-T40 through FE-T43 | All written | PASS |
| AC-7: Max-width | FE-T50 | FE-T50 | PASS |
| BR-2: No Matchups | FE-T05 | FE-T05 | PASS |
| BR-5: No color-only stale | FE-T34 | FE-T34: color + text verified | PASS |
| BR-6: Hamburger a11y | FE-T22 through FE-T29 | All written | PASS |
| BR-7: Hub exact match | FE-T07 | FE-T07 | PASS |

---

## Patterns for Knowledge Agent

[CONVENTION] E2E seed helpers for `sync_log` must use Drizzle ORM (not raw SQL), set `startedAt` from `completedAt - N ms` to satisfy the not-null constraint, and return the `id` for teardown. Always use `try/finally` in the test to guarantee cleanup even when assertions fail.

[CONVENTION] FE-T36 and FE-T37 (daily stale threshold E2E) are correctly skipped when the only rendered `SyncTimestamp` instance uses the hourly `dataType`. The unit tests for `getStaleThresholdMs("daily")` are the correct proving ground for the daily threshold. Do not add E2E tests that assert a threshold which the rendered component does not exercise.

[VIOLATION-FIXED] SeasonalPillBadge: removed incorrect `seasons.status` -> NFL season type mapping. `pre_draft` (Sleeper league lifecycle) is not equivalent to NFL preseason. The correct fix is `return null` until Epic 2 provides an NFL state table with real `season_type` and `week` columns. Code comment explains this decision in-file.

---

## Conclusion

All 6 violations from the prior CRITIC review are confirmed resolved. No new violations were introduced. The production code, component logic, accessibility attributes, and E2E test coverage are all correct and complete for the scope of this story.

**Story 1.3 is APPROVED.**
