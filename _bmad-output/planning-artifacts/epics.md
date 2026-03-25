---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics']
inputDocuments: ['ux-design-polish.md', 'prd.md', 'architecture.md', 'ux-design-specification.md']
---

# FantasyWebsite - Epic Breakdown (Polish Initiative)

## Overview

This document provides the complete epic and story breakdown for FantasyWebsite's visual polish initiative, decomposing the requirements from the UX Polish Specification into implementable stories. The original PRD, Architecture, and UX Design Specification serve as reference context.

## Requirements Inventory

### Functional Requirements

FR1: The homepage shall display a styled league identity hero with league name in Display weight, "Est. 2017" badge, league tagline, and current season/week context
FR2: The homepage shall display 3-4 league superlative stats (e.g., highest score this week, longest win streak, closest matchup, most all-time wins) derived from existing data
FR3: The homepage shall display all current week matchups (all 6 for a 12-team league), not just the top 5
FR4: The homepage standings section shall display a SuperlativeBadge on the 1st-place team and bold the leader's record
FR5: The homepage shall display a contextual season narrative block — "Last Week's Results" in-season or "League at a Glance" in offseason
FR6: MatchupRow components shall display a thin vertical bar (3px) in each team's brandingColor on their respective side
FR7: Franchise cards on the Teams page shall display a top border (3px) in each franchise's brandingColor
FR8: The franchise detail page hero shall display a subtle background gradient using the franchise's brandingColor at 5-8% opacity
FR9: Standings tables (homepage and dedicated) shall display a 2-3px left border in each franchise's brandingColor
FR10: The SuperlativeBadge component shall use Tailwind utility classes instead of inline style objects
FR11: All hardcoded hex color values in component inline styles shall be replaced with CSS variable references or Tailwind classes
FR12: A `--loss` CSS variable (#C4402F) shall be added to the design token system and referenced as `text-loss`
FR13: Status badges on the seasons page and filter buttons on the players page shall use the design token system instead of hardcoded inline styles
FR14: The LiveIndicator pulsing dot and label shall use `var(--primary)` (forest green) instead of Tailwind's built-in green-500/green-600
FR15: A clear visual hierarchy for links/buttons shall be established: primary action links, secondary action links, and card/row links with documented patterns
FR16: A reusable EmptyState component shall be created with icon, title, description, and optional action link
FR17: All existing empty state messages across pages shall be replaced with the EmptyState component with page-specific content
FR18: The ChampionshipStars component shall use SVG star icons (Lucide Star with fill) instead of text star characters, colored in gold
FR19: The trophy case on the records page shall display championship entries with season year, champion FranchiseIdentity, and gold SuperlativeBadge
FR20: Season detail pages shall display the champion with a gold-tinted background (5% opacity), ChampionshipStars (hero variant), and "League Champion" SuperlativeBadge
FR21: A `coOwnerDisplayName` field shall be added to the franchise_seasons table with a Drizzle migration
FR22: The daily sync and legacy import shall capture co-owner data from Sleeper's `co_owners` roster array and resolve display names
FR23: The FranchiseIdentity component shall accept and display a coOwnerName prop in hero and standard variants
FR24: All pages displaying ownerDisplayName shall also display coOwnerDisplayName when present, formatted as "{owner} & {coOwner}"

### NonFunctional Requirements

NFR1: All franchise color usage shall be decorative only — never the sole way to identify a team (accessibility compliance per original UX spec)
NFR2: The `--loss` color shall always be paired with a label ("L", score context) — never used alone to convey meaning
NFR3: All visual changes shall maintain WCAG 2.1 AA contrast ratios as defined in the original UX specification
NFR4: All animations shall continue to respect `prefers-reduced-motion` media query
NFR5: The superlative row shall use responsive grid: grid-cols-2 on mobile, grid-cols-4 on desktop
NFR6: No new third-party libraries or dependencies shall be introduced — use existing Lucide icons, Tailwind, shadcn/ui

### Additional Requirements

- Architecture mandates all styling through Tailwind CSS v4 utility classes (ADR: Frontend Architecture)
- Architecture mandates shadcn/ui primitives as base for UI components — no additional UI libraries (ADR: Frontend Architecture)
- Architecture mandates React Server Components by default — `"use client"` only for live score poller (ADR: Frontend Architecture)
- Architecture mandates Drizzle ORM for all database access including migrations (ADR: Data Architecture)
- Architecture mandates colocated route-specific components in route folders, shared components in `components/` (Structure Convention)
- Architecture mandates no hardcoded hex values — design tokens via Tailwind theme config (Implementation Pattern)
- Franchise brandingColor is a dynamic per-franchise value stored in DB — cannot be predefined as CSS variables, must use inline styles for border/accent colors

### UX Design Requirements

UX-DR1: Homepage hero shall use a subtle primary green background tint (3-5% opacity) to visually distinguish it from the page body
UX-DR2: Superlative row StatHero components shall use `md` size (36-40px numbers) on desktop, arranged in a responsive grid
UX-DR3: Homepage "Week N Matchups" section header shall dynamically display the current week number
UX-DR4: Franchise color accents on MatchupRow shall be left-edge for left team, right-edge for right team (mirroring the matchup layout)
UX-DR5: Franchise page hero gradient shall fade from brandingColor at 5-8% opacity to transparent below the hero section
UX-DR6: SuperlativeBadge base classes shall be: `inline-block text-caption uppercase tracking-wide font-medium rounded-full px-2 py-0.5`
UX-DR7: Link hierarchy: primary actions = `text-primary font-medium hover:underline`, secondary = `text-muted-foreground hover:text-foreground`, card/row = `text-primary hover:underline`
UX-DR8: EmptyState component shall be centered, max-width 400px, with spacing-2xl padding, using Lucide icons at 48px in `text-muted-foreground/50`
UX-DR9: ChampionshipStars SVG icons shall be 14px for inline variant and 20px for hero variant, with hero variant having subtle drop shadow
UX-DR10: Champion highlight on season pages shall use gold at 5% opacity background instead of current light primary background
UX-DR11: Co-owner formatting rule: "{owner} & {coOwner}" — consistent " & " separator everywhere, no "and", no commas
UX-DR12: Power rankings layout shall use flex-wrap at md breakpoint to prevent overflow on tablets
UX-DR13: SeasonSelector shall have fade/gradient indicators on edges when content overflows, and auto-scroll active season into view
UX-DR14: Mobile table card views shall activate consistently at md breakpoint (768px) with franchise identity left, key stat right pattern
UX-DR15: Bottom tab bar shall use `pb-[env(safe-area-inset-bottom)]` for notched device support

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 3 | Homepage league identity hero |
| FR2 | Epic 3 | Homepage superlative stats row |
| FR3 | Epic 3 | Homepage all matchups (not top 5) |
| FR4 | Epic 3 | Homepage standings with personality |
| FR5 | Epic 3 | Homepage season narrative block |
| FR6 | Epic 4 | MatchupRow brandingColor accents |
| FR7 | Epic 4 | Franchise card top borders |
| FR8 | Epic 4 | Franchise page hero gradient |
| FR9 | Epic 4 | Standings left border accents |
| FR10 | Epic 1 | SuperlativeBadge Tailwind migration |
| FR11 | Epic 1 | Eliminate hardcoded hex colors |
| FR12 | Epic 1 | Add --loss CSS variable |
| FR13 | Epic 1 | Unify status badge patterns |
| FR14 | Epic 1 | LiveIndicator brand color |
| FR15 | Epic 1 | Link/button hierarchy |
| FR16 | Epic 6 | EmptyState component |
| FR17 | Epic 6 | Page-specific empty states |
| FR18 | Epic 5 | ChampionshipStars SVG upgrade |
| FR19 | Epic 5 | Trophy case enhancement |
| FR20 | Epic 5 | Season champion gold highlight |
| FR21 | Epic 2 | Co-owner schema addition |
| FR22 | Epic 2 | Co-owner sync update |
| FR23 | Epic 2 | FranchiseIdentity co-owner prop |
| FR24 | Epic 2 | Co-owner display across pages |

## Epic List

### Epic 1: Visual Consistency & Design Token Cleanup
Users experience a consistent, polished visual language across all pages — unified badge styling, consistent color usage, clear link hierarchy, and brand-aligned live indicators. The site feels intentionally designed rather than incrementally assembled.
**FRs covered:** FR10, FR11, FR12, FR13, FR14, FR15
**UX-DRs covered:** UX-DR6, UX-DR7
**NFRs addressed:** NFR2, NFR3, NFR6

#### Story 1.1: SuperlativeBadge Tailwind Migration
Migrate the SuperlativeBadge component from inline style objects to Tailwind utility classes. Replace all variant style maps with Tailwind class maps using design tokens. Base classes: `inline-block text-caption uppercase tracking-wide font-medium rounded-full px-2 py-0.5`.
**FRs:** FR10 | **UX-DRs:** UX-DR6

#### Story 1.2: Eliminate Hardcoded Hex Colors & Add Loss Token
Audit all components for hardcoded hex color values in inline styles. Replace each with the appropriate CSS variable reference or Tailwind class. Add the `--loss: #C4402F` CSS variable to the design token system and reference as `text-loss`. Key files: h2h-hero.tsx, records/head-to-head/page.tsx, players/player-table.tsx, seasons/page.tsx, franchise-logo.tsx, franchise-selector.tsx.
**FRs:** FR11, FR12 | **UX-DRs:** — | **NFRs:** NFR2

#### Story 1.3: Unify Status Badge & Filter Patterns
Replace inline-styled status badges on the seasons page with SuperlativeBadge (green variant). Replace hardcoded filter button styles on the players page with Tailwind classes using design tokens (bg-primary, text-primary-foreground, bg-muted, text-muted-foreground).
**FRs:** FR13

#### Story 1.4: LiveIndicator Brand Color Alignment
Update the LiveIndicator / score-poller pulsing dot from Tailwind's built-in green-500/green-600 to `bg-primary`. Update the "Live" text label to `text-primary`. Ensures the live indicator matches the forest green brand.
**FRs:** FR14

#### Story 1.5: Link & Button Visual Hierarchy
Establish and apply a consistent visual hierarchy for interactive elements across the site. Primary action links: `text-primary font-medium hover:underline`. Secondary action links: `text-muted-foreground hover:text-foreground`. Card/row links: `text-primary hover:underline`. Add a developer reference comment block at the top of globals.css documenting the pattern.
**FRs:** FR15 | **UX-DRs:** UX-DR7

---

### Epic 2: Co-Owner Recognition
Co-owners like Bucky's General Store's co-owner are visible and credited everywhere owners appear — franchise pages, standings, season history. No league member is invisible.
**FRs covered:** FR21, FR22, FR23, FR24
**UX-DRs covered:** UX-DR11

#### Story 2.1: Co-Owner Schema & Migration
Add a nullable `coOwnerDisplayName` text field to the `franchise_seasons` table. Generate and run a Drizzle migration. Verify the migration applies cleanly and the field is queryable.
**FRs:** FR21

#### Story 2.2: Co-Owner Sync & Legacy Import
Update the daily sync logic to capture co-owner data from Sleeper's `co_owners` roster array. Resolve co-owner user IDs to display names via the users endpoint. Update the legacy import to backfill co-owner data for historical seasons. Store as `coOwnerDisplayName` (join multiple with " & ").
**FRs:** FR22

#### Story 2.3: Co-Owner Display Across Site
Update the FranchiseIdentity component to accept and render `coOwnerName` prop. Hero variant: "Owned by {owner} & {coOwner}". Standard variant: combined owner in caption. Update homepage standings, franchise detail page, season history cards, and teams overview to pass and display co-owner data. Formatting: always " & " separator, no "and", no commas.
**FRs:** FR23, FR24 | **UX-DRs:** UX-DR11

---

### Epic 3: League Hub Homepage
The homepage transforms from a data summary into a living league dashboard — league identity hero, multi-stat superlatives, all matchups, standings with personality, and a seasonal narrative block. Members have a reason to visit even without a specific question.
**FRs covered:** FR1, FR2, FR3, FR4, FR5
**UX-DRs covered:** UX-DR1, UX-DR2, UX-DR3
**NFRs addressed:** NFR5

#### Story 3.1: League Identity Hero
Replace the current plain text hero with a styled identity section. Display league name in Display weight, "Est. 2017" badge, one-line league tagline, and current season/week context in Body Small. Apply subtle primary green background tint at 3-5% opacity. Typography and spacing carry the personality — no images needed.
**FRs:** FR1 | **UX-DRs:** UX-DR1

#### Story 3.2: Superlative Stats Row
Replace the single StatHero with a row of 3-4 league superlatives. Desktop: horizontal row of StatHero components at md size (36-40px numbers). Mobile: 2x2 responsive grid. Stats: highest score this week, longest active win streak, closest matchup, most all-time wins. Server-rendered from existing queries — no new API calls. Static per page load.
**FRs:** FR2 | **UX-DRs:** UX-DR2 | **NFRs:** NFR5

#### Story 3.3: Full Week Matchups Display
Show all matchups for the current week on the homepage (all 6 for a 12-team league), not just top 5. Remove "View all matchups" link. Add dynamic section header "Week N Matchups". Keep ScorePoller integration for live game windows.
**FRs:** FR3 | **UX-DRs:** UX-DR3

#### Story 3.4: Standings with Personality
Enhance homepage standings: add SuperlativeBadge on standings leader ("1st Place" gold badge). Bold the top team's record. Integrate franchise brandingColor as a subtle 2-3px left border accent. Maintain existing desktop table / mobile card dual layout.
**FRs:** FR4

#### Story 3.5: Season Narrative Block
Add a contextual section between the superlative row and matchups. In-season: "Last Week's Results" with completed matchup summaries (winners bold, scores, biggest blowout callout). Offseason: "League at a Glance" with reigning champion + ChampionshipStars, total seasons, total matchups, most championships franchise. Uses PageSection with label, title, content.
**FRs:** FR5

---

### Epic 4: Franchise Identity & Color
Each franchise feels distinct with their brand colors surfaced as visual accents on matchup rows, team cards, franchise page heroes, and standings. The site feels like *our* league, not a generic template.
**FRs covered:** FR6, FR7, FR8, FR9
**UX-DRs covered:** UX-DR4, UX-DR5
**NFRs addressed:** NFR1

#### Story 4.1: MatchupRow Team Color Accents
Add a thin 3px vertical bar in each team's brandingColor on their side of the MatchupRow. Left team: left-edge accent. Right team: right-edge accent. Applied via inline style (dynamic per-franchise). Fall back to `var(--border)` if no brandingColor. Decorative only — team names and scores remain primary identifiers.
**FRs:** FR6 | **UX-DRs:** UX-DR4 | **NFRs:** NFR1

#### Story 4.2: Franchise Card Top Borders
On the all-franchises grid (Teams page), add a 3px top border in each franchise's brandingColor. Creates visual variety and makes each franchise feel distinct. Fall back to `var(--border)` if no brandingColor.
**FRs:** FR7 | **NFRs:** NFR1

#### Story 4.3: Franchise Page Hero Gradient
On the franchise detail page, apply a subtle background gradient using the franchise's brandingColor at 5-8% opacity in the hero section. Gradient fades to transparent below the hero. Creates a "team homepage" feel without overwhelming content.
**FRs:** FR8 | **UX-DRs:** UX-DR5 | **NFRs:** NFR1

#### Story 4.4: Standings Table Color Borders
In all standings tables (homepage and dedicated standings page), add a 2-3px left border in each franchise's brandingColor. Creates a color-coded roster at a glance while maintaining clean table layout. Fall back to `var(--border)`.
**FRs:** FR9 | **NFRs:** NFR1

---

### Epic 5: Championship & Trophy Experience
Championships and trophies feel premium — gold SVG stars replace text characters, the trophy case gets visual weight, and season champion highlights use gold-tinted treatments. Multi-championship franchises get their "that's sick" moment.
**FRs covered:** FR18, FR19, FR20
**UX-DRs covered:** UX-DR9, UX-DR10

#### Story 5.1: ChampionshipStars SVG Upgrade
Replace text star characters (★) with Lucide React Star icon using `fill="currentColor"` for solid gold stars. Color: `var(--gold)` (#B8860B). Inline variant: 14px. Hero variant: 20px with subtle drop shadow. Zero championships: render nothing. Preserve aria-label for accessibility.
**FRs:** FR18 | **UX-DRs:** UX-DR9

#### Story 5.2: Trophy Case Enhancement
Enhance the records page trophy case: each championship entry shows season year, champion FranchiseIdentity, gold SuperlativeBadge "League Champion". Most recent champion gets larger treatment (StatHero lg with season year). Historical champions listed chronologically below.
**FRs:** FR19

#### Story 5.3: Season Champion Gold Highlight
On season detail pages, update the champion section: gold-tinted background (gold at 5% opacity) instead of light primary background. Display ChampionshipStars (hero variant) next to champion name. Add SuperlativeBadge with gold variant: "League Champion".
**FRs:** FR20 | **UX-DRs:** UX-DR10

---

### Epic 6: Polished Edge States & Responsive Fixes
Empty states are graceful and informative with icons and action links. Tablet-width edge cases are resolved. The season selector handles overflow smoothly. The bottom tab bar respects notched devices. Every corner of the site feels finished.
**FRs covered:** FR16, FR17
**UX-DRs covered:** UX-DR8, UX-DR12, UX-DR13, UX-DR14, UX-DR15
**NFRs addressed:** NFR4

#### Story 6.1: EmptyState Component
Create a reusable EmptyState component: centered, max-width 400px, spacing-2xl padding. Anatomy: optional Lucide icon (48px, text-muted-foreground/50) → title (H3) → description (Body, muted) → optional action link. Respects prefers-reduced-motion.
**FRs:** FR16 | **UX-DRs:** UX-DR8 | **NFRs:** NFR4

#### Story 6.2: Page-Specific Empty States
Replace all existing plain-text empty state messages with the EmptyState component. Pages: homepage (no data), matchups, teams, seasons, H2H, player search (no results), error page. Each with page-specific icon, title, description, and optional action link per the UX polish spec table.
**FRs:** FR17 | **UX-DRs:** UX-DR8

#### Story 6.3: Responsive Edge-Case Fixes
Fix specific responsive breakpoint issues: power rankings flex-wrap at md breakpoint. Superlative row responsive grid (grid-cols-2 mobile, grid-cols-4 desktop). Audit MobileTableView consistency at 768px. SeasonSelector overflow with fade indicators and auto-scroll active season. Bottom tab bar safe-area-inset-bottom for notched devices.
**UX-DRs:** UX-DR12, UX-DR13, UX-DR14, UX-DR15
