# Story 3.4: Standings with Personality -- Requirements Brief

## Orchestrator Summary
**Story:** 3.4 -- Standings with Personality
**Status:** REQS complete; ready for handoff to FEND/BEND
**Scope:** Enhancement-only; all acceptance criteria are already implemented in the current `app/page.tsx` standings section. This brief confirms coverage and documents the verification checklist.
**Risk:** None identified. No conflicts found.
**Blocked by:** Nothing. SuperlativeBadge (Story 1.1) and co-owner display (Story 2.3) are already shipped.

---

## 1. Requirement Traceability

| Acceptance Criterion | FR/NFR | Status |
|---|---|---|
| First-place team has SuperlativeBadge ("1st Place" gold variant) | FR4 | Already implemented (page.tsx L289-291, L339-341) |
| Leader's record displayed in bold | FR4 | Already implemented (page.tsx L300, L350) |
| Each franchise row has 2-3px left border in brandingColor | FR4, FR9 | Already implemented (page.tsx L277, L328) |
| Fallback to `var(--border)` when no brandingColor | FR4 | Already implemented (page.tsx L277, L328) |
| Desktop table / mobile card dual layout maintained | FR4 | Already implemented (page.tsx L252-317 desktop, L320-375 mobile) |
| Color borders are decorative only | NFR1 | Satisfied; team name and record are primary identifiers |

## 2. Given/When/Then Coverage

### Scenario 1: Standings with data available

**Given** the homepage standings section
**When** standings data is available
**Then:**

1. **SuperlativeBadge on 1st place (FR4):** The `isLeader` flag (index === 0) gates a `<SuperlativeBadge text="1st Place" variant="gold" />` next to the franchise name. This appears in both desktop table (L289-291) and mobile card (L339-341). The SuperlativeBadge component (`components/superlative-badge.tsx`) renders with `bg-gold/10 text-gold` classes for the gold variant, using Tailwind utility classes per FR10/UX-DR6.

2. **Leader's record in bold (FR4):** The record cell applies `font-bold` conditionally: `className={\`text-sm tabular-nums ${isLeader ? "font-bold" : ""}\`}` on desktop (L300) and the wins span on mobile (L350).

3. **2-3px left border in brandingColor (FR4, FR9):** Desktop rows use `style={{ borderLeft: \`3px solid ${entry.franchiseBrandingColor ?? "var(--border)"}\` }}` (L277). Mobile cards use `style={{ borderLeftWidth: "3px", borderLeftColor: entry.franchiseBrandingColor ?? "var(--border)" }}` (L328).

4. **Dual layout preserved (FR4):** Desktop table uses `className="hidden md:block"` (L252). Mobile cards use `className="md:hidden"` (L320). Both render the full standings list.

### Scenario 2: Franchise without brandingColor

**Given** a franchise has no brandingColor
**When** the standings render
**Then:** The nullish coalescing operator (`??`) falls back to `"var(--border)"` for the left border color. This applies identically in both desktop (L277) and mobile (L328) views. The fallback uses the project's design token for borders, maintaining visual consistency (FR4).

## 3. Data Flow

- **Query:** `getSeasonStandings(seasonId)` from `lib/queries/seasons.ts` (L73-102)
- **Join:** `franchiseSeasons` INNER JOIN `franchises` provides `franchiseBrandingColor` (mapped from `franchises.brandingColor` column)
- **Ordering:** Results ordered by `franchiseSeasons.standingsFinish` ASC, so index 0 is always the leader
- **Co-owner:** `coOwnerDisplayName` is included in the query (L82) and rendered with " & " separator (L295, L345), per FR24/UX-DR11
- **No new queries needed.** All data is already fetched and passed to the standings section.

## 4. Component Dependencies

| Component | Location | Role |
|---|---|---|
| `SuperlativeBadge` | `components/superlative-badge.tsx` | Gold "1st Place" badge; already migrated to Tailwind (Story 1.1) |
| `PageSection` | `components/page-section.tsx` | Section wrapper with label/title; already used |
| `ScrollReveal` | `components/scroll-reveal.tsx` | Fade-in animation wrapper; already used |

## 5. Accessibility Compliance (NFR1, NFR3)

- **No color-only information (NFR1):** The brandingColor left border is purely decorative. Team identification is via text name, record, and rank number. The "1st Place" badge includes text label.
- **WCAG AA contrast (NFR3):** The SuperlativeBadge gold variant text uses `text-gold` (#B8860B) on `bg-gold/10` background. Body text uses `text-muted-foreground` on card/surface backgrounds. All pre-existing and validated.
- **No red/purple pairings:** No red or purple colors used in standings.

## 6. Conflict Analysis

**No conflicts identified.**

- FR4 (homepage standings personality) and FR9 (standings left border accents in Epic 4, Story 4.4) overlap: both call for 2-3px left border in brandingColor. The current implementation satisfies both. Story 4.4 covers dedicated standings pages (e.g., season detail page); this story covers only the homepage. No conflict since both specify the same treatment.
- The inline `style` attribute for `borderLeft`/`borderLeftColor` is necessary because brandingColor is a dynamic per-franchise DB value, not a predefined CSS variable. This is explicitly acknowledged in the epics document: "Franchise brandingColor is a dynamic per-franchise value stored in DB; cannot be predefined as CSS variables, must use inline styles for border/accent colors."

## 7. Implementation Verdict

**All acceptance criteria for Story 3.4 are already implemented in the current codebase.** The standings section in `app/page.tsx` (L244-386) contains:

- SuperlativeBadge "1st Place" gold variant on the leader
- Bold record for the leader
- 3px left border in franchiseBrandingColor with var(--border) fallback
- Desktop table and mobile card dual layout
- Co-owner display (from Story 2.3)
- Link to full season details

**Recommended action:** Mark Story 3.4 as complete after running verification tests (Playwright E2E) to confirm the visual output matches acceptance criteria against real data.

## 8. Verification Checklist

The following should be confirmed via Playwright E2E tests against the running dev server with seeded data:

- [ ] Desktop: first standings row has a `SuperlativeBadge` with text "1st Place"
- [ ] Desktop: first standings row record cell has `font-bold` class
- [ ] Desktop: each standings row has a 3px left border
- [ ] Desktop: standings row for franchise with brandingColor shows that color in the left border
- [ ] Desktop: standings row for franchise without brandingColor shows `var(--border)` color
- [ ] Mobile (< 768px): standings render as cards, not table rows
- [ ] Mobile: first card has SuperlativeBadge "1st Place"
- [ ] Mobile: first card wins span has `font-bold` class
- [ ] Mobile: each card has a 3px left border with franchise color or fallback
- [ ] Co-owner names display as "{owner} & {coOwner}" when present
