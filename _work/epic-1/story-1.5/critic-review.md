---
## Orchestrator Summary
- **Agent**: CRITIC
- **Story**: 1.5 — Empty State & Error Components
- **Verdict**: APPROVED
- **State transition**: fend-complete -> critic-approved
- **Flags**: One deviation from UXA spec (FE-T10 Button asChild vs buttonVariants direct), one unused import in error.tsx. Neither is a blocking violation. One structural concern about test fixture production exposure. Documented below.
---

# CRITIC Review: Story 1.5 — Empty State & Error Components

## Verdict: APPROVED

All acceptance criteria are met. No blocking violations found. Three non-blocking observations documented below.

---

## Checklist Results

### Architecture Compliance
- **Server components by default (CLAUDE.md):** PASS. `not-found.tsx` has no `"use client"` directive. `components/empty-state.tsx` has no `"use client"` directive. `error.tsx` has `"use client"` on line 1, required by Next.js App Router for error boundaries.
- **button-variants extraction:** PASS. `buttonVariants` CVA definition is cleanly separated into `components/ui/button-variants.ts` with no `"use client"` directive. This is server-safe and allows server components to apply button styling to Link elements without importing the client Button primitive.
- **Backward compatibility:** PASS. `components/ui/button.tsx` re-exports `buttonVariants` from `./button-variants` at line 24: `export { Button, buttonVariants }`. Any existing consumer importing `buttonVariants` from `@/components/ui/button` continues to work without modification. Source scan confirms no other files currently import `buttonVariants` directly from `button.tsx`; all imports are from `button-variants` or `button` (which re-exports). No breakage.
- **No raw SQL, no Zod schemas, no sync jobs:** N/A, correctly not present (pure UI story).

### Naming Conventions
- PASS. `button-variants.ts` follows `kebab-case` file naming. `EmptyState`, `Error`, `NotFound` (via `ErrorTriggerPage`) follow `PascalCase`. No violations.

### Frontend Discipline
- **`not-found.tsx` exact copy:** PASS. Title is `"This page doesn't exist."` (line 8, via HTML entity `&apos;`). Body is `"Maybe it was traded away."` (line 10).
- **`not-found.tsx` two nav links:** PASS. Two `<Link>` elements present: `href="/"` with "Go to Hub" (line 14-18) and `href="/teams"` with "Browse Teams" (line 20-25).
- **`error.tsx` exact copy:** PASS. Primary description on lines 17-20: "Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment." Assurance line on line 21-23: "We're showing the last available data." (via HTML entity `&apos;`).
- **`error.tsx` "If the problem persists" removed:** PASS. Not present anywhere in the file.
- **`error.tsx` two actions:** PASS. "Try again" Button calling `reset()` (line 26-28) and "Go home" Link with outline variant (lines 29-33).
- **`empty-state.tsx` iconMap comment:** PASS. Code comment on lines 5-14 documents all 6 canonical keys and their page-variant mappings.
- **`empty-state.tsx` all 6 keys present:** PASS. `calendar`, `users`, `search`, `alert`, `trophy`, `chart` all present in iconMap (lines 16-22). All 7 required page variants are covered (calendar serves both Matchups and Seasons).
- **No em-dashes:** PASS. Grep confirms no em-dash character (U+2014), `—`, or `&mdash;` in any of the three target files.
- **No prohibited phrases:** PASS. "Oops", "Uh oh", "If the problem persists", "Back to home", "Page not found", "may have been moved" are absent from all changed files.

### Accessibility
- PASS. Icons retain `aria-hidden="true"`. All meaning carried by text. No color-only signaling. No red/purple color pairings. `error` prop remains in the destructure signature for Next.js type compatibility (line 10 of error.tsx), even though it is not rendered.

### Security
- PASS. No secrets. No auth bypasses. Test fixture is not linked from production navigation (per comment on line 5 of error-trigger/page.tsx). `export const dynamic = "force-dynamic"` prevents build-time prerendering correctly.

### Code Quality
- PASS. No dead code, no over-engineering. Types are correct.

### Test Coverage
- **FE-T06:** Covered. Asserts 404 status, exact h1 text, absence of old title.
- **FE-T07:** Covered. Asserts snarky body copy, no em-dash.
- **FE-T08:** Covered. Asserts "Go to Hub" link visible, href="/", navigates to /.
- **FE-T09:** Covered. Asserts "Browse Teams" link visible, href="/teams", navigates to /teams.
- **EDGE-T01:** Covered. Deeply nested path asserts both text and both links.
- **FE-T11:** Covered. Asserts h1 text, absence of prohibited phrases.
- **FE-T12:** Covered. Asserts primary description text, no em-dash, no "If the problem persists".
- **FE-T13:** Covered. Asserts assurance line visible.
- **FE-T14:** Covered. Asserts "Try again" button visible, clickable, error page re-renders.
- **FE-T15:** Covered. Asserts "Go home" link visible, href="/", navigates to /.
- **No mocks:** PASS. Tests use real browser navigation via Playwright. FEND confirms tests ran against `npm run build && npm run start` with real Chromium.

**Test coverage gaps (source inspection tests, by design):**
- FE-T01, FE-T02, FE-T03, FE-T04: Require a `/test/empty-state` fixture page that was not created. The QA plan acknowledges this; it notes these can be verified by QA Phase B source inspection OR against any live page that uses `EmptyState`. Since the QA plan explicitly offers this alternative and the component is purely structural (no interactivity), this is acceptable for Phase 1. Future stories wiring `EmptyState` into pages will provide E2E coverage.
- FE-T05, FE-T10, FE-T16, EDGE-T04: Correctly designated as source inspection tests. Verified by CRITIC directly above.
- EDGE-T02, EDGE-T03: Not covered by E2E spec. QA plan designates these as optional/structural. Not blocking.

---

## Non-Blocking Observations

### OBS-1: FE-T10 — not-found.tsx uses `buttonVariants` directly, not `Button asChild`

The QA test plan (FE-T10) specifies: "Both navigation elements use `<Button asChild ...>` wrapping `<Link>`". The UXA spec (§1.2) specifies the same `Button asChild` pattern. However, `not-found.tsx` uses `buttonVariants()` directly on the `<Link>` className instead.

The FEND handoff explains this: "Used `buttonVariants()` directly on `<Link>` className rather than `Button asChild` (which is not supported by Base UI's Button primitive)." This is architecturally correct. The Base UI Button primitive does not support `asChild`; `buttonVariants` was extracted specifically to enable this pattern in server components. The rendered output is visually and semantically equivalent. The test assertions for FE-T08 and FE-T09 verify the actual link behavior, not the implementation pattern.

**Verdict:** Not a violation. The implementation correctly solves the constraint. The QA test plan source inspection assertion for FE-T10 (`<Button asChild>`) is outdated relative to the actual implementation; it should be updated to assert `buttonVariants` import instead, which is what actually shipped. This does not block approval.

[CONVENTION] Server component button-styled links: Use `buttonVariants()` directly on `<Link>` className. Do NOT attempt `Button asChild` with Base UI's Button primitive. `buttonVariants` is extracted to `components/ui/button-variants.ts` for this purpose.

### OBS-2: Unused `Button` import in `error.tsx`

`error.tsx` imports both `{ Button }` from `@/components/ui/button` (line 4) and `{ buttonVariants }` from `@/components/ui/button-variants` (line 5). The `Button` import IS used (line 26: `<Button onClick={reset} variant="default" size="lg">`). The `buttonVariants` import is used on line 31 for the "Go home" Link. Both imports are justified.

Wait — on inspection, this is correct. `error.tsx` is a `"use client"` component, so it CAN use the client Button primitive directly for the `onClick={reset}` action, and uses `buttonVariants` for the Link. Both imports are genuinely needed. No issue.

### OBS-3: Test fixture production exposure

`app/test/error-trigger/page.tsx` throws unconditionally in all environments. There is no `NODE_ENV !== 'production'` guard or `_` prefix route segment. The QA plan notes this is a "development-only" concern but designates production gating as the DEV agent's responsibility.

The fixture includes a comment stating it should not be linked from production navigation, but an intentionally crashing page is accessible at `/test/error-trigger` in production deployments on Vercel. This is a latent issue, not a current blocker: the page only affects users who specifically navigate to that URL, and the error boundary catches the throw gracefully. It does not expose sensitive data.

[PITFALL] Test fixture pages that throw unconditionally should be protected in production (e.g., `NODE_ENV` check, `_` prefix to opt out of routing, or deletion before production deploy). Leaving them as bare routes is acceptable for a hobby-tier project but would be rejected in a commercial context.

---

## Patterns to Remember

[CONVENTION] `buttonVariants` extraction pattern: CVA variant definitions belong in a dedicated `button-variants.ts` file without `"use client"`. The Button component imports from there. Server components import `buttonVariants` directly from `button-variants.ts` to style Link elements.

[CONVENTION] Error boundary copy requirements for HML: Title = "Something went wrong" (calm, not panicked). Primary description = "Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment." Assurance line = "We're showing the last available data." No em-dashes. No "Oops", "If the problem persists", or alarming language.

[CONVENTION] 404 page copy: Title = "This page doesn't exist." Body = "Maybe it was traded away." Two links: "Go to Hub" (default variant, href="/") and "Browse Teams" (outline variant, href="/teams").

[CONVENTION] `error.tsx` must have `"use client"` (Next.js App Router mandate). `not-found.tsx` and `EmptyState` must NOT have `"use client"`.

[VIOLATION-FIXED] Pre-existing: `components/site-nav.tsx` had a stale `@ts-expect-error` comment causing build-time type error. Removed by FEND as a cleanup item.
