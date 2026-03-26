# Story 6.1: EmptyState Component - Requirements Brief

> **Orchestrator Summary:** The EmptyState component already exists at `components/empty-state.tsx` and is already imported/used by 5 pages. This story is a **verification and gap-close** task, not a greenfield build. The existing implementation closely matches specs but has one minor deviation to audit (padding token usage). No conflicts detected.

---

## 1. Requirement Traceability

| Requirement | ID | Status in Codebase |
|---|---|---|
| Reusable EmptyState component with icon, title, description, optional action link | FR16 | **Exists** |
| EmptyState centered, max-width 400px, spacing-2xl padding | UX-DR8 | **Partial** (see Gap G1) |
| Animations respect prefers-reduced-motion | NFR4 | **Covered globally** (see Analysis A3) |

---

## 2. Existing Implementation Analysis

The component at `components/empty-state.tsx` already provides:

- **Props interface:** `icon?` (keyof iconMap), `title` (string), `description` (string), `actionLabel?` (string), `actionHref?` (string)
- **Icon map:** 6 Lucide icons mapped by string key: calendar, users, search, alert, trophy, chart
- **Layout:** Flex column, centered, `max-w-[400px]`, `mx-auto`, `py-16 px-4`, text-center
- **Icon:** 48px (`size-12`), `text-muted-foreground/50`, `strokeWidth={1.5}`, `aria-hidden="true"`
- **Title:** `text-h3` class, `mb-2`
- **Description:** `text-body text-muted-foreground`
- **Action link:** Next.js `Link`, `text-sm text-primary font-medium hover:underline`, right arrow entity
- **Server component:** No `"use client"` directive (correct per architecture rules)

### Current Consumers (5 pages already using EmptyState):
1. `app/page.tsx` (homepage fallback, icon: "chart")
2. `app/teams/page.tsx` (no franchises, icon: "users")
3. `app/seasons/page.tsx` (no seasons, icon: "calendar")
4. `app/records/head-to-head/page.tsx` (two uses: no franchises, no pair selected)
5. `app/players/player-table.tsx` (no search results, icon: "search")

---

## 3. Acceptance Criteria Verification

### AC1: Centered content with max-width 400px and spacing-2xl padding

**Given** the EmptyState component
**When** rendered with required props
**Then** it displays centered content with max-width 400px and spacing-2xl padding

**Analysis:** The existing component uses `max-w-[400px] mx-auto` (correct) and `py-16 px-4` for padding. The story specifies "spacing-2xl padding." Per `globals.css`, `--spacing-2xl: 4rem` (64px). The current `py-16` maps to `4rem` in Tailwind (64px), which matches `spacing-2xl`. The horizontal padding is `px-4` (16px / `spacing-sm`). The spec says "spacing-2xl padding" without specifying axis.

**Gap G1:** Verify whether "spacing-2xl padding" means vertical only (current `py-16` is correct) or all sides. If all sides, `px-4` (16px) would need to change to `px-16` (64px), but that would conflict with `max-w-[400px]` on narrow viewports. **Recommendation:** The current `py-16 px-4` is the correct interpretation; vertical padding is spacing-2xl, horizontal padding is minimal to avoid content overflow. No change needed.

### AC2: Optional Lucide icon at 48px in text-muted-foreground/50 opacity

**Given** the EmptyState component
**When** rendered with an icon prop
**Then** an optional Lucide icon renders at 48px in `text-muted-foreground/50` opacity

**Analysis:** Existing implementation uses `size-12` (48px) and `text-muted-foreground/50`. Matches exactly. The `aria-hidden="true"` is correctly applied (icon is decorative, title carries the meaning). The `strokeWidth={1.5}` provides a lighter, more elegant stroke that fits the "Press Box" aesthetic.

**Status:** PASS. No changes needed.

### AC3: Title in H3 style

**Given** the EmptyState component
**When** rendered
**Then** a title displays in H3 style

**Analysis:** Uses `<h3 className="text-h3 mb-2">`. The `text-h3` utility class is defined in `globals.css` (20-24px, weight 500, line-height 1.3). Correct semantic element and styling.

**Status:** PASS. No changes needed.

### AC4: Description in Body style with muted color

**Given** the EmptyState component
**When** rendered
**Then** a description displays in Body style with muted color

**Analysis:** Uses `<p className="text-body text-muted-foreground">`. The `text-body` utility is 16px, line-height 1.5. The `text-muted-foreground` maps to `#6B6560`. Correct.

**Status:** PASS. No changes needed.

### AC5: Optional action link as primary action

**Given** the EmptyState component
**When** rendered with actionLabel and actionHref
**Then** an optional action link renders as a primary action button/link

**Analysis:** The action link uses `text-sm text-primary font-medium hover:underline` with a right arrow. Per the link hierarchy documented in `globals.css` (FR15, UX-DR7), primary action links should be `text-primary font-medium hover:underline`. The current implementation uses `text-sm` in addition, making it slightly smaller than standard body text. This is a reasonable design choice for a secondary-feeling action within the empty state context. The `mt-4` spacing provides adequate separation.

**Status:** PASS. The action link follows the primary action link pattern from the design system.

### AC6: Prefers-reduced-motion respect (NFR4)

**Given** the `prefers-reduced-motion` media query is active
**When** EmptyState renders
**Then** any transitions respect the reduced motion preference

**Analysis:** The EmptyState component has no animations or transitions of its own. The only interactive element is the action link with `hover:underline`, which is a state change (not a transition). The global `prefers-reduced-motion` rule in `globals.css` (lines 198-207) already handles all `transition-duration` and `animation-duration` site-wide. This AC is satisfied by the global rule.

**Status:** PASS. No component-level changes needed; global CSS handles this.

---

## 4. Icon Mapping Verification

Story note specifies these mappings:

| Key | Icon | Use Case | Implemented? |
|---|---|---|---|
| `calendar` | Calendar | Matchups, Seasons | Yes, used by seasons page |
| `users` | Users | Teams | Yes, used by teams + H2H pages |
| `search` | Search | Players (no results) | Yes, used by player-table + H2H |
| `alert` | AlertCircle | Errors | Yes, mapped but not yet consumed |
| `trophy` | Trophy | Records | Yes, mapped but not yet consumed |
| `chart` | BarChart3 | Homepage, H2H (no data) | Yes, used by homepage |

All 6 icon mappings are present and correctly wired.

---

## 5. Design System Compliance Checklist

| Check | Status |
|---|---|
| Uses Tailwind utility classes only (no inline styles) | PASS |
| Uses design system typography classes (text-h3, text-body) | PASS |
| Uses design system color tokens (text-muted-foreground, text-primary) | PASS |
| No hardcoded hex values (FR11) | PASS |
| No `"use client"` directive (server component) | PASS |
| No additional UI libraries (NFR6) | PASS |
| Lucide icons from existing dependency (NFR6) | PASS |
| Accessible: icon is `aria-hidden`, text carries meaning | PASS |
| No animations that need reduced-motion handling | PASS |
| Action link follows link hierarchy pattern (UX-DR7) | PASS |

---

## 6. Conflicts and Risks

**No conflicts detected.**

- The component already exists and is actively used by 5 pages.
- All acceptance criteria are met by the current implementation.
- The global `prefers-reduced-motion` rule covers NFR4 without component-level changes.

---

## 7. Implementation Recommendation

**This story is effectively complete.** The existing `components/empty-state.tsx` satisfies all acceptance criteria (AC1-AC6), all referenced requirements (FR16, UX-DR8, NFR4), and follows all project conventions.

The implementer should:

1. **Verify** the existing component against each AC (read the file, confirm classes match).
2. **Write acceptance tests** per the project's testing rules: Playwright E2E tests that render pages with empty data and assert the EmptyState component appears with correct structure (icon, title, description, action link).
3. **Do NOT rewrite** the component; it is already correct.
4. **Note for Story 6.2:** Several pages still use plain-text empty states instead of the EmptyState component (matchups, drafts, trophies, leaderboard, power rankings, rivalries, playoffs, franchise detail, franchise roster, franchise drafts, season week detail). Those are Story 6.2's scope, not 6.1.

---

## 8. Test Strategy

Per project testing rules (no mocks, prove it works):

- **E2E (Playwright):** Navigate to a page that uses EmptyState with empty data conditions. Assert:
  - The empty state container is visible and centered
  - The icon SVG element is present (when icon prop is provided)
  - The H3 title text matches expected content
  - The body description text is present
  - The action link navigates to the correct href (when provided)
  - Screen reader: icon is hidden (`aria-hidden`), title and description are readable
- **Unit test (allowed, pure component):** Since this is a pure presentational component with no dependencies, a co-located `empty-state.test.ts` could verify the prop interface and icon map keys. However, the E2E tests are the primary acceptance gate.

---

## 9. Files Involved

| File | Action |
|---|---|
| `components/empty-state.tsx` | Verify (no changes expected) |
| `app/globals.css` | Reference only (spacing tokens, typography, reduced-motion) |
| `e2e/` | New E2E test file for empty state verification |
