---
## Orchestrator Summary
- **Agent**: QA Phase A
- **Story**: 1.5 — Empty State & Error Components
- **Status**: COMPLETE
- **State transition**: uxa-complete -> qa-plan-complete
- **Key findings**: DEV agent has three targeted edits to make. The `not-found.tsx` file has the most gaps: wrong title, wrong body copy, missing second nav link, no `Button` component. `error.tsx` needs description rewrite and a "Go home" secondary link added. `empty-state.tsx` is structurally correct but needs a code comment documenting canonical variant keys. All gaps are precisely specified below with exact copy strings to assert in tests.
---

# QA Test Plan: Story 1.5 — Empty State & Error Components

## Test Strategy

This story is purely UI. There are no database changes, no API endpoints, and no sync jobs. All three acceptance criteria are verifiable by navigating to real pages (or triggering a real error boundary) in the running Next.js application and asserting on rendered HTML.

**Testing approach:**
- E2E tests (Playwright) for the 404 page (navigate to a non-existent route) and the error boundary (trigger via a test-only error page).
- Component source inspection tests for the `EmptyState` component (rendered in isolation via a dedicated test fixture page, or verified by source-reading during QA Phase B review).
- No mocks. No stubs. The full Next.js dev server must be running.

**What makes a test pass:** The exact required copy strings must appear in the DOM. Navigation links must resolve to their target URLs. The `"use client"` directive must be present in `error.tsx` and absent from `not-found.tsx` and `empty-state.tsx`. The `Button` component must be used in `not-found.tsx` (not inline ad-hoc classes).

**Database state:** No database reads or writes in any of these components. No seed data required for any test case.

---

## AC Coverage Matrix

| AC | Description | Test IDs |
|---|---|---|
| AC1 | EmptyState component with contextual icon, title, description, action link | FE-T01, FE-T02, FE-T03, FE-T04, FE-T05 |
| AC2 | 404 page with snarky copy and two navigation links | FE-T06, FE-T07, FE-T08, FE-T09, FE-T10 |
| AC3 | Error boundary with calm copy and last-data assurance | FE-T11, FE-T12, FE-T13, FE-T14, FE-T15 |
| AC4 | Empty states never show a blank page | FE-T16 |

---

## API Tests (BE-T*)

None. This story has no API endpoints.

---

## E2E Tests (FE-T*)

### Prerequisites

- Next.js dev server running (`npm run dev`) connected to a real Postgres database.
- A test fixture page must exist at `/test/error-trigger` that intentionally throws a JavaScript error, causing Next.js App Router to render the nearest `error.tsx` boundary. This page should be added by the DEV agent as a test-only fixture. It must not be accessible in production (can be gated by `NODE_ENV !== 'production'` check or placed in a `_test/` route segment).
- No seed data required for any test case.

---

### AC1 — EmptyState Component

---

#### FE-T01: EmptyState renders icon, title, and description

**Seed data:** None.

**Setup:** A test fixture page at `/test/empty-state` must render an `EmptyState` with all props populated:
```
icon="calendar"
title="Test Title"
description="Test description text."
actionLabel="Test action"
actionHref="/test-link"
```
The DEV agent must create this fixture page as part of the story, or QA Phase B must verify the component on any real page that uses it.

**Steps:**
1. Navigate to the fixture page (or any live page that renders `EmptyState`).
2. Inspect the rendered output.

**Assertions:**
- A `<svg>` element with `aria-hidden="true"` is present inside the component container.
- The SVG has Tailwind class `size-12` (48px).
- The SVG has class `text-muted-foreground/50`.
- An `<h3>` element contains the title text.
- A `<p>` element contains the description text.
- The container `<div>` has class `max-w-[400px]` and `mx-auto` and `py-16`.

**Database state verification:** N/A — no database interaction.

---

#### FE-T02: EmptyState renders optional action link when props provided

**Seed data:** None.

**Steps:**
1. Navigate to a page rendering `EmptyState` with `actionLabel` and `actionHref` set.
2. Assert the action link is present.

**Assertions:**
- An `<a>` element (rendered by Next.js `Link`) is visible below the description.
- The link text matches the `actionLabel` value passed.
- The link `href` attribute matches the `actionHref` value passed.
- The link has classes `text-primary` and `font-medium`.

**Database state verification:** N/A.

---

#### FE-T03: EmptyState renders without action link when props are omitted

**Seed data:** None.

**Steps:**
1. Navigate to a page rendering `EmptyState` without `actionLabel` and `actionHref`.
2. Assert no action link exists.

**Assertions:**
- No `<a>` element appears inside the component container.

**Database state verification:** N/A.

---

#### FE-T04: EmptyState renders without icon when icon prop omitted

**Seed data:** None.

**Steps:**
1. Navigate to a page rendering `EmptyState` without the `icon` prop.
2. Assert no SVG is rendered.

**Assertions:**
- No `<svg aria-hidden="true">` exists inside the component container.
- The `<h3>` title renders at the top of the container.

**Database state verification:** N/A.

---

#### FE-T05: EmptyState iconMap covers all 7 required variant keys

**This is a source inspection test.** QA Phase B must read `components/empty-state.tsx` and verify the following keys exist in the `iconMap` object: `calendar`, `users`, `search`, `alert`, `trophy`, `chart`. All six are required to cover the 7 canonical variants (calendar is shared by Matchups and Seasons; chart is shared by Homepage and H2H).

**Assertions (source-level):**
- `iconMap` contains key `"calendar"` mapped to `Calendar` from lucide-react.
- `iconMap` contains key `"users"` mapped to `Users` from lucide-react.
- `iconMap` contains key `"search"` mapped to `Search` from lucide-react.
- `iconMap` contains key `"alert"` mapped to `AlertCircle` from lucide-react.
- `iconMap` contains key `"trophy"` mapped to `Trophy` from lucide-react.
- `iconMap` contains key `"chart"` mapped to `BarChart3` from lucide-react.
- A code comment listing the canonical variant keys for page implementors is present (per UXA spec §1.1).

**Database state verification:** N/A.

---

### AC2 — 404 Page

---

#### FE-T06: Navigating to a non-existent route renders the 404 page with exact title

**Seed data:** None.

**Steps:**
1. Navigate to `/this-route-does-not-exist-qa-1234` (or any clearly non-existent path).
2. Assert the page renders the 404 component.

**Assertions:**
- HTTP response status is 404 (verify via network tab or Playwright response interceptor).
- An `<h1>` element is present with exact text: `"This page doesn't exist."`
- The title does NOT contain: `"Page not found"` (the old generic copy must be gone).
- The title does NOT contain: `"Oops"` or any prohibited phrase.

**Database state verification:** N/A.

---

#### FE-T07: 404 page displays exact snarky body copy

**Seed data:** None.

**Steps:**
1. Navigate to `/this-route-does-not-exist-qa-1234`.
2. Locate the body paragraph.

**Assertions:**
- A `<p>` element contains exact text: `"Maybe it was traded away."`
- The paragraph does NOT contain the old generic copy: `"The page you're looking for doesn't exist or may have been moved."`
- The paragraph does NOT contain an em-dash character (`—`).

**Database state verification:** N/A.

---

#### FE-T08: 404 page contains a working link to Hub (`/`)

**Seed data:** None.

**Steps:**
1. Navigate to `/this-route-does-not-exist-qa-1234`.
2. Locate and click the "Go to Hub" button.

**Assertions (before click):**
- A button or link with text `"Go to Hub"` is visible on the page.
- The underlying `<a>` element has `href="/"`.
- The button uses the primary variant (forest green background) — verify it has class `bg-primary` or the equivalent design token class (NOT inline styles like `bg-green-700`).

**Assertions (after click):**
- The browser navigates to `/` (the Hub / homepage).
- The URL in the address bar is `/`.

**Database state verification:** N/A.

---

#### FE-T09: 404 page contains a working link to Teams (`/teams`)

**Seed data:** None.

**Steps:**
1. Navigate to `/this-route-does-not-exist-qa-1234`.
2. Locate and click the "Browse Teams" button.

**Assertions (before click):**
- A button or link with text `"Browse Teams"` is visible on the page.
- The underlying `<a>` element has `href="/teams"`.
- The button uses the outline variant — verify it has class `border` and `bg-background` or equivalent (NOT the primary green background).

**Assertions (after click):**
- The browser navigates to `/teams`.
- The URL in the address bar is `/teams`.

**Database state verification:** N/A.

---

#### FE-T10: 404 page uses Button component, not ad-hoc inline classes

**This is a source inspection test.** QA Phase B must read `app/not-found.tsx` and verify:

**Assertions (source-level):**
- `import { Button } from "@/components/ui/button"` is present at the top of the file.
- Both navigation elements use `<Button asChild ...>` wrapping `<Link>` — NOT bare `<Link>` elements with inline Tailwind button classes.
- No inline class strings like `rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground` appear on any element (these are the ad-hoc classes from the old implementation that must be removed).
- The file does NOT contain a `"use client"` directive.
- `import Link from "next/link"` is present.

**Database state verification:** N/A.

---

### AC3 — Error Boundary

---

#### FE-T11: Error boundary displays exact title copy

**Seed data:** None.

**Setup:** Navigate to the test fixture page at `/test/error-trigger` which throws an error, causing `error.tsx` to render.

**Steps:**
1. Navigate to `/test/error-trigger`.
2. Assert the error boundary renders.

**Assertions:**
- An `<h1>` element is present with text: `"Something went wrong"`.
- The title does NOT contain `"Oops"`, `"Uh oh"`, `"Something bad happened"`, or `"Error occurred"`.
- The title uses class `text-h2`.

**Database state verification:** N/A.

---

#### FE-T12: Error boundary displays primary description without em-dashes or prohibited phrases

**Seed data:** None.

**Steps:**
1. Navigate to `/test/error-trigger`.
2. Locate the primary description paragraph.

**Assertions:**
- A `<p>` element is present containing: `"Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment."`
- The description paragraph does NOT contain an em-dash character (`—`).
- The description does NOT contain the old copy: `"This may be due to a sync issue or a server error. Please try again in a moment."` (old implementation text that must be removed).
- The description does NOT contain `"If the problem persists"` (this sentence has no spec basis and must be removed).

**Database state verification:** N/A.

---

#### FE-T13: Error boundary displays last-data assurance line

**Seed data:** None.

**Steps:**
1. Navigate to `/test/error-trigger`.
2. Locate the assurance paragraph.

**Assertions:**
- A `<p>` element is present containing exact text: `"We're showing the last available data."`
- The element has class `text-caption`.
- The element has class `text-muted-foreground`.

**Database state verification:** N/A.

---

#### FE-T14: "Try again" button calls reset() and re-renders the page segment

**Seed data:** None.

**Steps:**
1. Navigate to `/test/error-trigger`.
2. Locate the "Try again" button.
3. Click the button.

**Assertions (before click):**
- A `<button>` element with text `"Try again"` is visible.
- The button has the primary variant styling (forest green background).
- The button has `size="lg"` equivalent classes.

**Assertions (after click):**
- The `reset()` function fires (the error boundary attempts a re-render of the segment).
- If the test fixture is designed to throw every time: the error page re-renders (the "Try again" button reappears).
- If the test fixture is designed to succeed on retry: the error boundary unmounts and normal content appears.

**Note for DEV agent:** The test fixture at `/test/error-trigger` should throw unconditionally on first load so the error page is reliably rendered. Testing `reset()` behavior is acceptable as a manual verification step if the retry cycle is hard to automate deterministically.

**Database state verification:** N/A.

---

#### FE-T15: "Go home" button navigates to `/`

**Seed data:** None.

**Steps:**
1. Navigate to `/test/error-trigger`.
2. Locate the "Go home" button.
3. Click the button.

**Assertions (before click):**
- A button or link with text `"Go home"` is visible.
- The underlying `<a>` element has `href="/"`.
- The button uses the outline variant styling (border, background-colored, NOT forest green fill).

**Assertions (after click):**
- The browser navigates to `/`.
- The URL in the address bar is `/`.

**Database state verification:** N/A.

---

#### FE-T16: Error boundary source has "use client" directive; not-found and empty-state do not

**This is a source inspection test covering BR4 and the architecture rule (CLAUDE.md: server components by default).** QA Phase B must read each file and verify:

**Assertions (source-level):**
- `app/error.tsx`: First line is `"use client";` — required by Next.js App Router for error boundaries.
- `app/not-found.tsx`: File does NOT contain `"use client"` anywhere.
- `components/empty-state.tsx`: File does NOT contain `"use client"` anywhere.

**Database state verification:** N/A.

---

### AC4 — Empty States Never Show a Blank Page

---

#### FE-T16 (structural): EmptyState component is composable alongside SyncTimestamp

**This is a structural/source test.** The `EmptyState` component must not impose any layout that prevents it from being rendered as a sibling to `SyncTimestamp`.

**Assertions (source-level):**
- The `EmptyState` component renders a single `<div>` as its root element with no `position: fixed`, `position: absolute`, or full-viewport dimensions.
- The component does NOT import or render `SyncTimestamp` internally.
- The component's outer `<div>` uses `max-w-[400px] mx-auto` which constrains width but does not prevent sibling elements above or below it in the same column layout.

**Note:** Full wiring of `EmptyState` into individual pages is deferred to each page story (2.x, 3.x, etc.). This test only verifies that the component structure does not prevent that wiring.

**Database state verification:** N/A.

---

## Security / Isolation Tests

None applicable. These are pure static/server UI components with no authentication, no API calls, and no database interaction.

---

## Edge Case Tests

### EDGE-T01: 404 page for deeply nested non-existent routes

**Steps:**
1. Navigate to `/seasons/9999/weeks/99/matchups/fake-id`.
2. Assert the 404 component renders (not a server crash or blank page).

**Assertions:**
- `<h1>` contains `"This page doesn't exist."`
- `<p>` contains `"Maybe it was traded away."`
- Both navigation buttons are present.

**Database state verification:** N/A.

---

### EDGE-T02: EmptyState with all 6 valid icon keys renders without JavaScript error

**Steps:**
1. Render `EmptyState` with each of the 6 icon keys: `"calendar"`, `"users"`, `"search"`, `"alert"`, `"trophy"`, `"chart"`.
2. Assert no runtime errors and the SVG icon renders for each.

**Assertions:**
- For each key, a `<svg aria-hidden="true">` is present in the output.
- No `undefined` or blank icon slot is rendered.
- No console errors about unknown icon keys.

**Database state verification:** N/A.

---

### EDGE-T03: EmptyState with an invalid icon key falls back gracefully

**Steps:**
1. Render `EmptyState` with `icon="nonexistent-key"`.

**Assertions:**
- No JavaScript error is thrown (the `iconMap` lookup returns `undefined`; the `Icon && <Icon />` guard prevents rendering).
- The component renders with title and description intact.
- No `<svg>` is rendered (icon slot is empty, not broken).

**Database state verification:** N/A.

---

### EDGE-T04: Copy compliance — no prohibited phrases in any of the three components

**This is a source inspection test.** QA Phase B must search all three files for prohibited content.

**Files to check:** `app/not-found.tsx`, `app/error.tsx`, `components/empty-state.tsx`

**Prohibited strings (must NOT appear):**
- `—` (em-dash, Unicode U+2014)
- `--` (double hyphen used as em-dash substitute)
- `Oops`
- `Uh oh`
- `Something bad happened`
- `Error occurred`
- `If the problem persists`
- `Page not found` (old generic 404 title)
- `The page you're looking for`
- `may have been moved`
- `Back to home` (old CTA text)

**Database state verification:** N/A.

---

## PMCP Visual Checklist

The following items must be manually verified by a human reviewer (or a Playwright screenshot assertion) against the running application. These supplement the automated assertions above.

### 404 Page Visual Checklist

Navigate to `/this-route-does-not-exist-qa-1234` and verify:

- [ ] Page background is warm cream (`#FAF8F5` range) — NOT white, NOT dark.
- [ ] Title "This page doesn't exist." is rendered in `text-h2` size (28-32px), Bold 700 weight, dark charcoal color.
- [ ] Body "Maybe it was traded away." is rendered in `text-body` size (16px), warm medium gray (`#6B6560` range).
- [ ] "Go to Hub" button has a forest green background (`#2D5A3D` range) with cream foreground text. It is NOT a bare link styled with inline classes.
- [ ] "Browse Teams" button has an outline style: warm light gray border, background-colored fill, charcoal text.
- [ ] On mobile viewport (375px wide): Both buttons stack vertically, each full-width within the button group.
- [ ] On desktop viewport (1280px wide): Both buttons sit side-by-side, appropriately sized.
- [ ] The page fills at least 50% of the viewport height (`min-h-[50vh]`), content is vertically centered.
- [ ] No red or purple colors appear anywhere on the page.
- [ ] No horizontal scrollbar appears at any viewport width.

### Error Page Visual Checklist

Navigate to the test fixture error trigger page and verify:

- [ ] Page background is warm cream, consistent with the rest of the site.
- [ ] Title "Something went wrong" renders in `text-h2` style, calm and neutral tone — NOT alarming red, NOT oversized panic styling.
- [ ] Primary description paragraph "Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment." renders in `text-body text-muted-foreground`.
- [ ] Assurance line "We're showing the last available data." renders in `text-caption text-muted-foreground` (12px, slightly smaller than the primary paragraph).
- [ ] "Try again" button has a forest green primary background.
- [ ] "Go home" button has an outline style, consistent with the "Browse Teams" button on the 404 page.
- [ ] On mobile viewport (375px wide): Both buttons stack vertically.
- [ ] On desktop viewport (1280px wide): Both buttons sit side-by-side.
- [ ] No red or purple colors appear anywhere on the page.
- [ ] No horizontal scrollbar at any viewport width.

### EmptyState Component Visual Checklist

Navigate to any page that uses `EmptyState` (or the test fixture page) and verify:

- [ ] Icon renders at 48px (Tailwind `size-12`), muted opacity (approximately 50% of the surrounding text color). It is clearly visible but not prominent.
- [ ] Icon has NO color-only meaning — the title and description below it convey the full message independently.
- [ ] Title renders in `text-h3` size (20-24px), Medium 500 weight.
- [ ] Description renders in `text-body text-muted-foreground` (16px, warm gray).
- [ ] Action link (when present) renders in forest green (`text-primary`) with medium weight, underlines on hover.
- [ ] Component is horizontally centered and does not exceed 400px wide.
- [ ] Generous vertical padding (64px top and bottom from `py-16`) gives the component breathing room.
- [ ] Component renders correctly on mobile (no overflow, no cropping).

---

## What Is NOT Tested

1. **Page-level wiring of `EmptyState`:** Individual page stories (2.x, 3.x, etc.) are responsible for importing and using `EmptyState` with the correct variant props. This story only tests the component itself.

2. **`SyncTimestamp` integration with `EmptyState`:** The structural composability is verified (FE-T16), but the combined visual output is owned by each page story.

3. **Error boundary for specific error types:** `error.tsx` is a generic catch-all. Testing that it catches specific error subtypes (network errors, Postgres timeouts, etc.) is deferred to the stories that trigger those errors.

4. **Screen reader behavior and focus order:** WCAG compliance for screen reader flow (especially after `reset()` fires) is noted as a Phase 1 limitation in the UXA spec. It is documented but not tested here.

5. **`not-found.tsx` custom metadata export:** Adding `export const metadata = { title: "Page Not Found | HML" }` is flagged as an optional enhancement by the UXA spec (not blocking). It is not tested here.

6. **Production vs. development environment differences:** The test fixture pages (`/test/error-trigger`, `/test/empty-state`) are development-only. Their production gating is a DEV agent responsibility, not a QA test concern.

7. **Error boundary for the live score poller specifically:** The poller error case (freeze + timestamp) is a separate concern owned by the live scores story. `error.tsx` is only tested as a generic catch-all here.
