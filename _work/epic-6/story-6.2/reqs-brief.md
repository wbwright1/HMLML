# Story 6.2: Page-Specific Empty States - Requirements Brief

> **Orchestrator Summary:** The EmptyState component (Story 6.1) is complete and already used by 5 pages. This story requires replacing **11 remaining plain-text empty state messages** across 9 files with the EmptyState component. Additionally, 1 existing EmptyState usage (H2H match history) needs an icon added, and the error page (`error.tsx`) uses "Something went wrong" which is acceptable per CLAUDE.md voice guidelines. No conflicts detected. The `leaderboard-table.tsx` is a `"use client"` component, requiring a slight integration consideration.

---

## 1. Requirement Traceability

| Requirement | ID | Coverage |
|---|---|---|
| All existing empty state messages replaced with EmptyState component with page-specific content | FR17 | This story's primary scope |
| EmptyState centered, max-width 400px, spacing-2xl padding, Lucide icons 48px | UX-DR8 | Inherited from Story 6.1; each usage must pass correct props |
| No new third-party libraries | NFR6 | Constraint; EmptyState uses existing Lucide icons only |

---

## 2. Current State Audit

### Already Using EmptyState (5 pages, no changes needed unless noted)

| File | Icon | Title | Notes |
|---|---|---|---|
| `app/page.tsx:391` | chart | "Syncing League Data" | Correct per story spec (homepage, chart icon) |
| `app/teams/page.tsx:26` | users | "Loading Franchises" | Correct per story spec (teams, users icon) |
| `app/seasons/page.tsx:27` | calendar | "No Seasons Yet" | Correct per story spec (seasons, calendar icon) |
| `app/players/player-table.tsx:569` | search | "No Players Found" | Correct per story spec (player search, search icon) |
| `app/records/head-to-head/page.tsx:78` | users | "No Data Available" | Correct (H2H no-franchise-data state) |
| `app/records/head-to-head/page.tsx:86` | search | "Select Two Franchises" | Correct (H2H prompt state) |

### Plain-Text Empty States to Replace (11 instances across 9 files)

| # | File | Line | Current Message | Required Icon | Required Action Link |
|---|---|---|---|---|---|
| 1 | `app/drafts/page.tsx:26` | 26 | "No draft data available yet..." | calendar | Optional: link to `/seasons` |
| 2 | `app/matchups/page.tsx:28` | 28 | "No matchup data available yet..." | calendar | Already has link to `/seasons` (must be preserved as action link) |
| 3 | `app/records/leaderboard-table.tsx:77` | 77 | "No leaderboard data available..." | trophy | None (context is filtered by season selector) |
| 4 | `app/records/trophies/page.tsx:105` | 102-107 | "No championship data available yet..." | trophy | Optional: link to `/seasons` |
| 5 | `app/records/power-rankings/page.tsx:43` | 40-46 | "No power rankings data available yet..." | chart | None |
| 6 | `app/records/rivalries/page.tsx:49` | 48-50 | "No rivalry data available yet..." | users | None |
| 7 | `app/playoffs/[seasonYear]/page.tsx:369` | 365-376 | "No playoff data available for the {year} season." | calendar | Already has link to `/seasons/${year}` (must be preserved as action link) |
| 8 | `app/teams/[franchiseSlug]/roster/page.tsx:168` | 167-169 | "No roster data available yet..." | users | None |
| 9 | `app/teams/[franchiseSlug]/page.tsx:148` | 147-149 | "No season history available yet." | calendar | None |
| 10 | `app/seasons/[seasonYear]/week/[week]/page.tsx:122` | 119-130 | "No matchup data available for this week." | calendar | Already has link to `/seasons/${year}` (must be preserved as action link) |
| 11 | `app/teams/[franchiseSlug]/drafts/page.tsx:116` | 115-117 | "No draft history available yet..." | calendar | None |

### Additional Instance to Audit

| File | Line | Current Message | Issue |
|---|---|---|---|
| `app/records/head-to-head/page.tsx:158` | 157-158 | "No matchup history found between these two franchises." | Plain `<p>` tag inside selected H2H view; should use EmptyState with chart icon |

**Total changes: 12 instances** (11 listed above + 1 H2H match history)

---

## 3. Given/When/Then Coverage

### AC1: Page-specific EmptyState with icon, title, description, and optional action link

**Given** the EmptyState component exists (Story 6.1 complete)
**When** any page has no data to display
**Then** the page uses EmptyState with page-specific icon, title, description, and optional action link

Implementation tasks per page specified in the story:

| Page | Icon | Verification |
|---|---|---|
| Homepage (no data) | chart | Already done (line 391). PASS. |
| Matchups (no matchups) | calendar | Instance #2: replace `<p>` + `<Link>` with `<EmptyState icon="calendar" ... actionHref="/seasons" actionLabel="Browse league history" />` |
| Teams (no teams) | users | Already done (line 26). PASS. |
| Seasons (no seasons) | calendar | Already done (line 27). PASS. |
| Head-to-head (no data) | chart | Already done for franchise-selection states. Instance #12 (match history): replace plain `<p>` with `<EmptyState icon="chart" .../>` |
| Player search (no results) | search | Already done (line 569). PASS. |
| Records/trophies (no data) | trophy | Instance #4: replace `<div><p>` with `<EmptyState icon="trophy" .../>` |

**Additional pages not explicitly listed in story AC but required by FR17 ("all existing plain-text empty state messages"):**

- Drafts index (instance #1)
- Leaderboard table (instance #3)
- Power rankings (instance #5)
- Rivalries (instance #6)
- Playoffs per-season (instance #7)
- Franchise roster (instance #8)
- Franchise season history (instance #9)
- Week detail (instance #10)
- Franchise draft history (instance #11)

### AC2: Voice and tone compliance

**Given** all empty states
**Then** none use "Oops", "Uh oh", or panicked language
**And** all follow the site's confident, calm voice

Audit findings:
- **error.tsx** uses "Something went wrong" which is the exact phrasing CLAUDE.md prescribes. No change needed.
- **not-found.tsx** uses snarky voice ("Maybe it was traded away"). No change needed.
- None of the current plain-text messages use panicked language. All replacements must maintain calm, confident tone.
- Descriptions should be informational, not apologetic. Use active voice: "Rankings appear once the season is underway" not "Sorry, we don't have rankings yet."

---

## 4. Implementation Constraints

### C1: Client Component Integration (`leaderboard-table.tsx`)
`app/records/leaderboard-table.tsx` is a `"use client"` component. The EmptyState component is a server component (no `"use client"` directive). Server components can be imported into client components as long as they are passed as children or imported directly. Since EmptyState has no server-only APIs (no `async`, no DB calls), it can be safely imported into the client component. No changes to EmptyState needed.

### C2: Wrapper Elements
Several current empty states are wrapped in styled `<div>` containers (e.g., `rounded-xl border border-border bg-card p-8 text-center` in trophies, power rankings, playoffs, week detail). When replacing with EmptyState, the outer wrapper `<div>` should be removed since EmptyState provides its own centering and spacing. If the EmptyState appears inside a card-like section, the EmptyState's own `py-16 px-4 max-w-[400px] mx-auto` styling is sufficient.

### C3: Dynamic Content in Descriptions
Some empty states include dynamic content:
- Leaderboard: `"No leaderboard data available for ${activeSeason}"` (dynamic season filter)
- Playoffs: `"No playoff data available for the {year} season."` (dynamic year)
- Week detail: Link to `/seasons/${year}` (dynamic year)

The EmptyState component accepts string props, so dynamic interpolation works naturally via template literals. The `actionHref` prop supports dynamic paths.

### C4: Import Statement
Each file being modified must add `import { EmptyState } from "@/components/empty-state";` if not already present.

### C5: No New Icons Needed
All required icons (calendar, users, search, trophy, chart) are already in the EmptyState `iconMap`. No additions to the component needed.

---

## 5. Content Specification (Recommended Copy)

All copy must avoid em-dashes, "Oops", "Uh oh", or panicked language per CLAUDE.md.

| # | Page Context | Icon | Title | Description | Action |
|---|---|---|---|---|---|
| 1 | Drafts index | calendar | "No Draft Data" | "Draft history will appear once draft data has been synced from Sleeper." | actionLabel: "Browse seasons", actionHref: "/seasons" |
| 2 | Matchups index | calendar | "No Matchups Available" | "Matchup data will appear once the season begins and scores are synced from Sleeper." | actionLabel: "Browse league history", actionHref: "/seasons" |
| 3 | Leaderboard (filtered) | trophy | "No Leaderboard Data" | "No leaderboard data available{dynamic: ` for ${activeSeason}`}." | None |
| 4 | Trophies | trophy | "No Championship Data" | "Championship history will appear once season data has been synced." | actionLabel: "View seasons", actionHref: "/seasons" |
| 5 | Power rankings | chart | "No Power Rankings" | "Rankings appear once the season is underway." | None |
| 6 | Rivalries | users | "No Rivalry Data" | "Rivalry records will appear once matchup data has been synced." | None |
| 7 | Playoffs per-season | calendar | "No Playoff Data" | "No playoff data available for the {year} season." | actionLabel: "Back to {year} season", actionHref: "/seasons/{year}" |
| 8 | Franchise roster | users | "No Roster Data" | "Roster data will appear once rosters have been synced from Sleeper." | None |
| 9 | Franchise season history | calendar | "No Season History" | "Season history will appear after data sync completes." | None |
| 10 | Week detail | calendar | "No Matchup Data" | "No matchup data available for this week." | actionLabel: "Back to {year} season", actionHref: "/seasons/{year}" |
| 11 | Franchise drafts | calendar | "No Draft History" | "Draft history will appear once draft data has been synced from Sleeper." | None |
| 12 | H2H match history | chart | "No Match History" | "No matchup history found between these two franchises." | None |

---

## 6. Conflicts

**None detected.** The EmptyState component API (icon, title, description, actionLabel, actionHref) handles all identified use cases without modification.

---

## 7. Acceptance Testing Approach

Per CLAUDE.md acceptance testing rules (no mocks):

1. **Visual verification (Playwright E2E):** For each page, seed the database with zero records for the relevant data type, load the page, and assert:
   - The EmptyState component renders (check for the `max-w-[400px]` container or specific title text)
   - The correct icon is present (check for `aria-hidden="true"` SVG within the container)
   - The title and description text match specification
   - Action links, when present, navigate to the correct URL
   - No panicked language ("Oops", "Uh oh") appears anywhere

2. **Voice audit:** Grep the entire `app/` directory for "Oops", "Uh oh", "uh oh", "oops" after implementation; assert zero matches.

3. **Regression:** Ensure pages that already have EmptyState (homepage, teams, seasons, players, H2H) remain unchanged.

---

## 8. Files to Modify

| File | Change Type |
|---|---|
| `app/drafts/page.tsx` | Add EmptyState import; replace `<p>` with EmptyState |
| `app/matchups/page.tsx` | Add EmptyState import; replace `<p>` + `<Link>` with EmptyState |
| `app/records/leaderboard-table.tsx` | Add EmptyState import; replace `<p>` with EmptyState |
| `app/records/trophies/page.tsx` | Add EmptyState import; replace `<div><p>` with EmptyState |
| `app/records/power-rankings/page.tsx` | Add EmptyState import; replace `<div><p>` with EmptyState |
| `app/records/rivalries/page.tsx` | Add EmptyState import; replace `<p>` with EmptyState |
| `app/playoffs/[seasonYear]/page.tsx` | Add EmptyState import; replace `<div><p><Link>` with EmptyState |
| `app/teams/[franchiseSlug]/roster/page.tsx` | Add EmptyState import; replace `<p>` with EmptyState |
| `app/teams/[franchiseSlug]/page.tsx` | Add EmptyState import; replace `<p>` with EmptyState |
| `app/seasons/[seasonYear]/week/[week]/page.tsx` | Add EmptyState import; replace `<div><p><Link>` with EmptyState |
| `app/teams/[franchiseSlug]/drafts/page.tsx` | Add EmptyState import; replace `<p>` with EmptyState |
| `app/records/head-to-head/page.tsx` | Replace `<p>` at line 157-158 with EmptyState (import already exists) |

**Files NOT modified (already compliant):**
- `app/page.tsx` (homepage)
- `app/teams/page.tsx`
- `app/seasons/page.tsx`
- `app/players/player-table.tsx`
- `app/error.tsx` (voice is correct; not an "empty state" per FR17)
- `app/not-found.tsx` (voice is correct; custom layout, not an empty-data state)
- `components/empty-state.tsx` (no changes needed)
