---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 1.5 — Empty State & Error Components
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: All three deliverables (EmptyState, not-found.tsx, error.tsx) already exist in the codebase with partial implementation. This story is a gap-fill and upgrade task, not a greenfield build. See "Current State Assessment" section for precise gaps.
---

# Implementation Brief: Story 1.5 — Empty State & Error Components

## Story Reference

- **Story ID:** 1.5
- **Epic:** 1 — Project Foundation & Design System
- **Requirement sources:** UX-DR32, UX-DR33, NFR5, NFR7, UX Design Spec §Empty, Error, and Loading States, UX Polish Spec §Tier 4

---

## Current State Assessment

All three target files exist. Each has gaps relative to the acceptance criteria:

### `components/empty-state.tsx` (EXISTS — partial)
**What exists:** Reusable `EmptyState` component with icon, title, description, action link. Centered, max-width 400px, py-16 padding. Lucide icons at 48px with `text-muted-foreground/50`. Icon passed as string key from a fixed `iconMap`.

**Gaps:**
1. The `iconMap` contains only 6 icons: `calendar`, `users`, `search`, `alert`, `trophy`, `chart`. All 7 page-specific variants defined in UX Polish Spec §4.2 must be verifiable against this set (see Variant Table below). Any missing icons must be added.
2. The `icon` prop type is `keyof typeof iconMap` (a string union). The UX Polish Spec §4.2 defines a `Matchups (no data)` variant requiring an appropriate icon. Cross-check that every variant has a matching key in the map.
3. No `aria-label` or `role` on the container. Accessibility requirement (NFR12, CLAUDE.md §Accessibility) requires all non-color signals to be text-backed. The icon already has `aria-hidden="true"` which is correct; verify the title/description provide sufficient accessible context without additional ARIA on the wrapper.

### `app/not-found.tsx` (EXISTS — insufficient)
**What exists:** Renders "Page not found" (plain, generic). Single "Back to home" link. No snarky copy. Inline Tailwind classes replicating a button without using the `Button` component.

**Gaps (UX-DR33):**
1. Title must be: "This page doesn't exist." (exact copy, or equivalent on-brand equivalent — see Resolved Ambiguity below).
2. Body copy must include snarky tone: "Maybe it was traded away." (exact copy from UX Design Spec §404 / Not Found and from the story's acceptance criteria).
3. Must include **two** navigation links: Hub (`/`) AND Teams (`/teams`) — the story spec requires both; the current file has only one.
4. Must use the `Button` component (or a correctly styled anchor matching the design system) consistently with other pages.
5. No `"use client"` directive is needed or allowed (CLAUDE.md: Server components by default).

### `app/error.tsx` (EXISTS — partial)
**What exists:** `"use client"` directive (correct — required by Next.js App Router for error boundaries). Calm, non-panicked tone. A "Try again" button calling `reset()`. Two paragraphs of explanatory text.

**Gaps (NFR5, NFR7, UX Design Spec §Empty, Error, and Loading States):**
1. The primary message is "Something went wrong" but the UX Design Spec §4.2 specifies the title as "Something Went Wrong" — capitalization parity is fine; the copy itself matches. However, the description in §4.2 reads: "Data is temporarily unavailable. This may be a sync issue — try refreshing in a moment." The current implementation has a longer two-paragraph version. **The brief requires aligning to the spec's single-description pattern** (see Resolved Ambiguity below).
2. The spec says: show "last available data" messaging when possible (UX Design Spec §Empty, Error, and Loading States: "We're showing the last available data"). The current copy does not include this phrase. The story's acceptance criteria require: "Something went wrong. We're showing the last available data." This exact phrase must appear (NFR5: site remains accessible; NFR7: graceful degradation).
3. An optional "Go home" action link (`/`) is specified in §4.2. The current file has only a "Try again" (reset) button. Both should be present: reset (primary) and Go home (secondary/link).

---

## Restated Acceptance Criteria (Given/When/Then)

### AC1 — EmptyState component with contextual icon, title, description, action (UX-DR32)
**Given** any page section has no data to display
**When** that section renders
**Then** the `EmptyState` component is rendered with:
- A contextual Lucide React icon at 48px with `text-muted-foreground/50` opacity and `aria-hidden="true"`
- A title (H3 weight, `text-h3` class)
- A description (body text, `text-muted-foreground`)
- An optional action link (when `actionLabel` and `actionHref` are provided)
- Centered layout, max-width 400px, generous vertical padding (py-16 or equivalent `spacing-2xl`)

### AC2 — 404 page with snarky messaging and two navigation links (UX-DR33)
**Given** a visitor navigates to any URL that does not match a known route
**When** Next.js resolves to `app/not-found.tsx`
**Then** the page displays:
- A snarky title referencing the missing page
- Body copy that includes "Maybe it was traded away." (verbatim, per spec and story)
- A link to Hub (`/`)
- A link to Teams (`/teams`)
- On-brand styling consistent with the design system (no inline ad-hoc button classes)

### AC3 — Error boundary with calm messaging and last-data assurance (NFR5, NFR7)
**Given** a server component throws an unhandled error
**When** Next.js App Router renders the nearest `error.tsx` boundary
**Then** the page displays:
- Title: "Something went wrong" (calm, not panicked — no "Oops!")
- Description that includes the phrase "We're showing the last available data" (NFR5 assurance)
- A "Try again" action button calling `reset()`
- A secondary "Go home" link to `/`
- The `"use client"` directive (required by Next.js for error boundaries)

### AC4 — Empty states never show a blank page (NFR5)
**Given** a page has no data
**When** the page renders
**Then** an appropriate `EmptyState` variant is shown (never a blank section)
**And** if cached data with a timestamp is available, it is shown alongside the empty state message

*Note: AC4 is largely enforced by using `EmptyState` consistently. The "last-cached data with timestamp" clause depends on pages being wired to `EmptyState` — this story delivers the component; each page story wires it. The component itself must support being composed alongside a timestamp (it imposes no layout that would prevent this).*

---

## Database Changes

None. This story is purely UI components. No schema changes, no new tables, no migrations.

---

## API Endpoints

None. No new API routes required.

---

## Validation Schemas

None. No Sleeper API calls, no Zod schemas.

---

## Business Rules

### BR1 — Error tone (UX Design Spec §Empty, Error, and Loading States)
Error messages must be calm and confident. Prohibited phrases: "Oops!", "Uh oh", "Something bad happened", "Error occurred". Required tone: matter-of-fact, like a trusted scoreboard operator.

### BR2 — 404 tone (UX-DR33, UX Design Spec §404 / Not Found)
The 404 page uses light snark. The phrase "Maybe it was traded away." is specified verbatim in both the UX Design Spec and the story acceptance criteria. This is not optional flavor — it is the required copy. The title ("This page doesn't exist.") is also specified.

### BR3 — No color-only signaling (NFR12, CLAUDE.md §Accessibility)
Icons in `EmptyState` are decorative (`aria-hidden="true"`). All meaning is carried by the title and description text. No red/purple color pairings. No information conveyed by color alone.

### BR4 — Server component default (CLAUDE.md §Key Architecture Decisions)
`not-found.tsx` must NOT have `"use client"`. It is a pure server component.
`error.tsx` MUST have `"use client"` — this is a Next.js App Router requirement for error boundaries.
`EmptyState` must NOT have `"use client"` — it is a pure display component (no interactivity).

### BR5 — No em-dashes in copy (CLAUDE.md §Writing Style)
All user-facing copy (titles, descriptions, action labels) must not contain em-dashes (--). Use commas, semicolons, colons, or parentheses instead. The UX Design Spec §4.2 description for Error page contains an em-dash: "This may be a sync issue — try refreshing in a moment." This must be rewritten. **Resolved:** Use "This may be a sync issue. Try refreshing in a moment." (two sentences).

### BR6 — Icon coverage (UX Polish Spec §4.2)
The `iconMap` in `EmptyState` must include keys for all 7 page-specific variants. See Variant Table. Add missing icons as needed. Do not remove existing keys.

---

## Page-Specific EmptyState Variants (UX Polish Spec §4.2)

All 7 required variants with their exact copy and required icon:

| Page Context | Suggested Icon Key | Title | Description | Action |
|---|---|---|---|---|
| Homepage (no data) | `chart` (or `calendar`) | "Syncing League Data" | "We're pulling data from Sleeper. Standings, matchups, and history will appear here once the first sync completes." | None |
| Matchups (no data) | `calendar` | "No Matchups Yet" | "Matchup data will appear once the season begins and scores sync from Sleeper." | "Browse league history" → `/seasons` |
| Teams (no data) | `users` | "Loading Franchises" | "Franchise data is syncing from Sleeper. Check back shortly." | None |
| Seasons (no data) | `calendar` | "No Seasons Yet" | "Season history will appear after the first data sync completes." | None |
| H2H (no data) | `chart` | "Select Two Franchises" | "Choose two franchises above to see their head-to-head history." | None |
| Player search (no results) | `search` | "No Players Found" | "No players match '[query]'. Check the spelling or try a different name." | None |
| Error page (inline section) | `alert` | "Something Went Wrong" | "Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment." | "Go home" → `/` |

*Note: The Player search variant uses a dynamic `[query]` placeholder. The `description` prop must accept the query string interpolated by the calling page. The `EmptyState` component itself receives the final string — no interpolation logic belongs inside the component.*

*Note: "Loading Franchises" and "Syncing League Data" describe a transient sync state, not an error. These appear only when the database has zero rows for that data type — the initial sync has not run. This is distinct from a server error.*

---

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| `"use client"` usage | Required only in `error.tsx` | Next.js App Router mandate for error boundaries |
| Accessibility | Pass | Icons are `aria-hidden`; meaning carried by text; no color-only signaling |
| No red/purple color pairings | Pass | `text-muted-foreground/50` is warm gray; no red or purple in these components |
| Tabular figures | N/A | These components contain no numeric stats |
| Responsive layout | Pass | `max-w-[400px] mx-auto` centers correctly on all viewports; no horizontal scroll risk |
| Geist Sans font | Pass | Inherited from root layout; no font override needed in these components |
| 8px spacing unit | Verify | `py-16` = 64px (8 × 8) — correct. `mb-4` = 16px — correct. `mb-2` = 8px — correct. All within the 8px grid. |
| Press Box brand colors | Pass | `text-muted-foreground` = `#6B6560`; `text-primary` = `#2D5A3D`; consistent with design tokens |
| No shadcn/ui default colors | Pass | Using HML-mapped CSS custom properties throughout |
| No additional UI libraries | Pass | Lucide React is already in the project |
| Server components by default | Pass | Only `error.tsx` uses `"use client"` |

---

## NFR Targets

| NFR | Requirement | How This Story Satisfies It |
|---|---|---|
| NFR5 | Site remains accessible during Sleeper API outages; all pages serve last-cached data | `error.tsx` explicitly communicates "We're showing the last available data"; `EmptyState` provides structured empty content rather than blank pages |
| NFR7 | Game-window poller degrades gracefully on Sleeper API errors | `error.tsx` is the root fallback for unhandled errors including poller errors; calm messaging prevents user alarm |
| NFR12 | No information conveyed by color alone | All `EmptyState` icons have `aria-hidden`; titles and descriptions carry full meaning in text |

---

## Resolved Ambiguities

### Ambiguity 1 — Error description length
The story's acceptance criteria quote: "Something went wrong. We're showing the last available data." The existing `error.tsx` has two paragraphs of longer copy. The spec (UX Design Spec §4.2) specifies a single-sentence description. **Resolution:** Replace with spec-aligned copy: primary paragraph = "Data is temporarily unavailable. This may be a sync issue. Try refreshing in a moment." Secondary assurance line = "We're showing the last available data." Both phrases from the spec and story AC should appear, but the two-paragraph current version must be collapsed into one cohesive description block. The "If the problem persists" sentence in the current file has no spec basis and should be removed.

### Ambiguity 2 — Em-dash in spec copy
UX Design Spec §4.2 error description contains "This may be a sync issue — try refreshing in a moment." CLAUDE.md prohibits em-dashes in output. **Resolution (CLAUDE.md overrides):** Use "This may be a sync issue. Try refreshing in a moment." (two sentences).

### Ambiguity 3 — 404 title exact wording
The story acceptance criteria say: "snarky messaging ('This page doesn't exist. Maybe it was traded away.')". The UX Design Spec says: "Tone: confident, maybe a little snarky. 'This page doesn't exist. Maybe it was traded away.'" Both sources align. **Resolution:** Title = "This page doesn't exist." Body = "Maybe it was traded away." These are the required strings.

### Ambiguity 4 — EmptyState icon for Matchups
The `iconMap` currently has no explicit "matchups" key. The `calendar` key maps to `Calendar` from Lucide React, which is semantically appropriate for schedule/matchup contexts. **Resolution:** Use `calendar` for both the Homepage (no data) and Matchups (no data) variants. If the designer later wants a distinct icon for matchups (e.g., `Swords`, `Target`), that is a future enhancement. For now `calendar` is sufficient and already in the map.

### Ambiguity 5 — "last-cached data with timestamp" (AC4 last clause)
The story says "empty states never show a blank page; always show last-cached data with timestamp when possible." This implies pages should show whatever data they have cached plus an `EmptyState` for the missing section. This story delivers the `EmptyState` component. Wiring it into individual pages (seasons, matchups, teams, etc.) is each page story's responsibility, not story 1.5's. **Resolution:** Story 1.5 is complete when: (a) the component exists with all required props, (b) it is structurally composable next to a timestamp display, and (c) page-level stories are noted as consumers. The `SyncTimestamp` component (already exists at `components/sync-timestamp.tsx`) handles the timestamp display; `EmptyState` is designed to be rendered alongside it, not to include it internally.

---

## Forward Dependencies

| Story | Dependency |
|---|---|
| All page stories (2.x, 3.x, 4.x, etc.) | Import and use `EmptyState` from `components/empty-state.tsx` with page-specific props per the Variant Table above |
| Story 1.3 (Layout) | `not-found.tsx` and `error.tsx` must be styled consistently with the layout wrapper established in 1.3; both should render inside the root layout's padding/max-width context |
| Live score poller (story with matchup live scores) | `error.tsx` is the fallback if the poller's parent component throws; poller-specific error handling (freeze + timestamp) is separate from this boundary |

---

## Open Questions

None. All ambiguities resolved above. No conflicts between architecture decisions and acceptance criteria were found.

---

## Implementation Checklist (for DEV agent)

1. **`components/empty-state.tsx`** — verify all 7 variant icon keys exist in `iconMap`; add any missing Lucide icons. No other structural changes required; the component already meets the spec.
2. **`app/not-found.tsx`** — rewrite title to "This page doesn't exist.", add body copy "Maybe it was traded away.", add second nav link to `/teams`, replace inline button classes with `Button` component import.
3. **`app/error.tsx`** — update description copy to include "We're showing the last available data."; remove the second "If the problem persists" paragraph; add a secondary "Go home" link to `/` alongside the existing "Try again" button; ensure no em-dashes in copy.
4. Run `tsc --noEmit` and linting after changes.
5. No E2E tests required for this story per the acceptance testing patterns (these are pure UI components with no database or API interaction). A Playwright smoke test that navigates to a non-existent URL and asserts the 404 copy appears is optional but recommended.
