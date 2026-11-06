# Design System Reference

Read this before UI work. The non-negotiable rules are summarized in `CLAUDE.md`; this file holds the full reference. Token values are defined in `app/globals.css`, which is the source of truth if this file and the CSS ever disagree. The original design direction and mocks live in `docs/redesign/` (`PROJECT_NOTES.md`, `HMLML Platform.dc.html`).

## Theme: "Command Center", Warm Charcoal & Gold (dark-only)

The whole site renders on a warm charcoal canvas. There is no light theme; tokens are centralized so a future light mode is a re-point, not a rewrite. Mock vocabulary maps to tokens as: **ink** -> `--text-primary`, **muted** -> `--text-tertiary`, **dim** -> `--text-muted`, **accent** -> `--accent-gold`.

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#1A1613` | App / page / card background ("bg") |
| `--surface` | `rgba(255,255,255,.045)` | Chips, search fields, tab bar (translucent) |
| `--surface-muted` | `rgba(255,255,255,.07)` | Slightly raised surfaces, hover rows |
| `--border` | `rgba(255,255,255,.08)` | Hairline borders |
| `--border-strong` | `rgba(255,255,255,.14)` | Emphasized borders, active outlines |
| `--divider` | `rgba(255,255,255,.05)` | Row separators (`border-divider`/`divide-divider`) |
| `--text-primary` | `#F2EADC` | Primary text ("ink"): titles, key numbers |
| `--text-secondary` | `#B8B0A0` | Body text (AA-safe on canvas) |
| `--text-tertiary` | `#98917F` | Labels, kickers, metadata ("muted") |
| `--text-muted` | `#6E6759` | "dim": DECORATIVE / disabled / large-text (24px+) ONLY, fails AA (3.2:1) for body |
| `--accent-green` | `#8FBF7F` | Positive: win, live dot, up-arrow ("positive") |
| `--accent-green-light` | `rgba(143,191,127,.14)` | Green tint backgrounds |
| `--accent-gold` | `#E2B858` | Brand: active nav, links, key numbers ("accent") |
| `--accent-gold-light` | `rgba(226,184,88,.13)` | Accent-tint: active pill/row background |
| `--accent-warm` | `#C97C6A` | Negative: loss, mercy-rule, down-arrow, doormat (rust, NOT red) |
| `--accent-warm-light` | `rgba(201,124,106,.14)` | Warm tint backgrounds |

Card gradient fill: `linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02))`. Card inner glows: gold blob top-left `rgba(226,184,88,.09)`, sage blob top-right `rgba(120,150,110,.06)`, both `pointer-events:none`.

## Typography (three-font rule)

- **Instrument Serif, italic (400)**: display, page titles, wordmark, editorial asides. Classes: `.text-display` (40-56px), `.text-h1` (36-44px), `.text-h2` (28-32px). Bound to `font-serif` / `var(--font-serif)`. Minimal negative tracking.
- **Geist**: all UI, labels, body, buttons. Weights 400/500/600/700/900. Classes: `.text-h3` (20-24px, 500), `.text-body-lg` (18px), `.text-body` (16px), `.text-body-sm` (14px), `.text-caption` (12px, 500, .06em, uppercase). This is the default `font-sans`.
- **JetBrains Mono, tabular**: EVERY numeral: scores, records, stats, ranks. Class `.text-stat` (700, `tabular-nums`) / `font-mono` / `var(--font-mono)`. Never render a score or stat in the serif or in Geist. One exception: a numeral inside a serif italic display sentence (the hub hero headline, the recap headline) stays in the serif; an upright mono figure dropped mid-sentence breaks the line.
- **Kicker** (`.text-kicker`): 10-11px, weight 600, `letter-spacing:.18em`, uppercase, `--text-tertiary`. The small eyebrow label above titles and card groups.
- Tabular figures (`font-variant-numeric: tabular-nums`) on all `td`/`th` and every score/stat number.

## Card & Surface Language

- `.card-surface`: the gradient fill + hairline `--border` + inset top highlight + drop shadow (`0 24px 60px rgba(0,0,0,.30)`), radius **14px** (`--radius`). This is the primary card.
- `.card-glows`: optional ambient gold + sage radial blobs; requires a positioned, clipped host (applied together with `.card-surface` on signature cards).
- Radius scale: cards 14px; pills 999px; chips/fields ~10-11px. Derived tokens `--radius-sm..-4xl` scale off `--radius`.

## Franchise Identity Display

- Wherever a franchise is identified, render `FranchiseLogo` from `components/franchise-logo.tsx`. A bare letter code is never the primary identifier.
- Never hand-roll a crest chip (a `brandingColor` square with the team's initials in it). That is `FranchiseLogo`'s monogram fallback, and it must come from the component so the fallback lives in exactly one place.
- Sizes: `size={28}` in Book rows and list rows; **24px in compact grid columns**, which is both the floor (below 28px the monogram is pinned at 9px) and effectively the ceiling (the mobile pick'ems column is 40px wide); 20px in slip rails, hero stat chips and slate cards; 14px in "via" notes, decorative only.
- `FranchiseLogo` renders a `div`, so it can never sit inside a `<p>`: the parser closes the paragraph early and React refuses to hydrate it. Wrap crest-plus-name lines in a `div` or a `span`. On the hub, use `components/hub/team-flag.tsx` (`TeamFlag` plus the `FlagTeam` shape) rather than writing that pairing again.
- Pair every logo with visible text. Pass `decorative` (alt `""`) only when the franchise's full name is visible immediately adjacent; otherwise pass the name so the identity is announced. Both render paths announce the name when non-decorative: `alt` on the avatar `<img>`, `role="img"` plus `aria-label` on the monogram fallback, matching `PlayerHeadshot`'s monogram branch. The visible-text rule still stands for sighted users; it is not a substitute for the accessible name.
- The codes from `lib/team-acronym.ts` and the persisted `franchises.abbreviation` are a fallback and a compact secondary label, not a primary identifier. Do not derive a franchise code any other way; `.slice(0, n)` on a team name is not an abbreviation scheme.
- Accepted exceptions, which stay letter codes or plain text: native `<option>` labels (an option cannot host an element), prose sentences, and cells whose value is a *pick* or an event rather than an identity (the pick'ems grid cell names the team a member picked, not the member).
- Use `components/franchise-identity.tsx` when championship stars and owner attribution are wanted; it has no size below 32px, so compact sites use `FranchiseLogo` directly. Its `CREST_PX` map duplicates `franchise-logo.tsx`'s `sizeMap` by convention: any sizing work touches both.

## Spacing (8px base unit)

- All spacing from 8px multiples: 8, 16, 24, 32, 48, 64, 96, 128.
- Content max-width: 1200px centered on desktop.
- Mobile: single column, 16px horizontal padding.
- Generous whitespace.

## Semantic Indicators

- **Positive (win, up, live):** sage green `#8FBF7F`, ALWAYS paired with a text label or glyph: "W", the number beside a ▲, or the "LIVE" label.
- **Negative (loss, down, mercy-rule, doormat):** warm rust `#C97C6A`, ALWAYS paired with a text label or glyph: "L", the number beside a ▼.
- **Wins:** bold type weight + "W" label; **Losses:** regular/light weight + "L" label.
- **Streaks/Records:** gold accent for positive superlatives; bold type for all record callouts.
- **Live/Active:** green dot with an expanding pulse ring (`@keyframes live-pulse`: scale 1 to 2.4, opacity .75 to 0, 1.6s) + "LIVE" text label.
- **Achievements/Awards:** `--accent-gold` + gold-tint (`--accent-gold-light`) card background.
- **Negative Superlatives ("Sting"):** `--accent-warm` + warm-tint (`--accent-warm-light`) card background + snarky label.
- **Snarky labels** are defined in a centralized content system (TypeScript constants in `lib/content.ts`), not hardcoded per component. Examples: "Point Machine", "Iron Curtain", "League Doormat", "Glass Cannon", "Coaching Malpractice".

## Accessibility detail

- All color-coded badges include text labels ("W", "L", "CHAMP", "STREAK").
- `--text-primary`/`-secondary`/`-tertiary` all clear 4.5:1 on canvas; `--text-muted` is ~3.2:1 and never body copy.
- Cards over tables on mobile when a table would exceed 3-4 columns.

## Site Voice & Personality

- Confident, snarky editorial voice: "the friend in the group chat who always has the receipts".
- Bad stats and losses are highlighted with the same design care as wins; the emotional range is part of the experience.
- Error messages are calm and confident, never panicked: "Something went wrong. We're showing the last available data." NOT "Oops!"
- The 404 page can be snarky: "This page doesn't exist. Maybe it was traded away."

## Design Principles

- **Trash talk first:** every design decision filters through "does this give someone something to brag about or roast someone with?"
- **Speed-to-stat:** never more than two taps from any stat.
- **Screenshot-worthy by default:** cards, awards, and stat callouts are self-contained; a screenshot should make sense in a group chat with no explanation.
- **The site knows what season it is:** hub content shifts automatically with the football calendar.
- **Cards over tables, always on mobile:** tables are reserved for deep-dive pages on larger screens.
- **Bold typography as the hero** for key stats and records.
- **Curated over comprehensive:** the hub surfaces 4-6 compelling things, not a data dump.

## Navigation Structure

- **Desktop topbar (64px, `components/nav/topbar.tsx`):** serif "HMLML" wordmark (left), centered pill nav [Hub, Teams, Records, Drafts, The Book] (active = accent-tint background + gold text), right cluster: inline search field (~230px, ⌘K hint), a live-games pill (pulsing green dot + "N GAMES LIVE"), and the current user's dynasty crest.
- **Mobile:** slim top header (56px, `components/nav/mobile-header.tsx`: wordmark, then a right cluster of compact live pill, search icon trigger, and dynasty crest) plus a **fixed bottom dock** (`components/nav/mobile-dock.tsx`): a tab-bar-only 5-icon nav [Hub, Teams, Records, Drafts, The Book] (icon + 9px label, active = accent-tint + gold), ~80px + safe-area. The dock labels The Book "Book" (`dockLabel` in `components/nav/nav-pills.tsx`); "The Book" does not fit at 9px in a fifth of the screen, and the full name stays as the link's aria-label.
- **The nav stays at five items; The Book took the Players slot** (Blake's call, 2026-08-29). `/players` is reachable by search (its primary door), the footer's Players link (`components/site-footer.tsx`), every PlayerLink on the site, and the "All players in the league" entry on team roster pages. Do not re-add a Players pill without removing something else.
- No hamburger; search opens a full-screen dialog from the header icon (same shared search UI as desktop, different trigger).
- The header stays pinned at all times; only the bottom dock hides on scroll-down and reveals on scroll-up (`components/nav/scroll-chrome.tsx`), always shown within 8px of the top to absorb iOS rubber-band. Bottom clearance for scrollable content lives on the footer (`pb-[calc(env(safe-area-inset-bottom)+96px)] lg:pb-8` on `SiteFooter`), not on `app/layout.tsx`'s `<main>`.
- **Live Pill:** shows live-game count during game windows, otherwise the seasonal state ("Preseason", "Week 9", "Playoffs", "Offseason").
- **Matchups are NOT a nav item;** live matchup cards surface on the hub during game windows and link to matchup detail pages.

## Seasonally-Aware Hub

The homepage renders different content based on the football calendar, determined by the Sleeper NFL state endpoint (`/v1/state/nfl`, via `lib/queries/nfl-state.ts`). Each state has its own component in `components/hub/`: `preseason-hub.tsx`, `regular-season-hub.tsx` (which hands off to `between-weeks-hub.tsx` from the Tuesday week roll to Thursday kickoff), `playoffs-hub.tsx`, and `offseason-hub.tsx`. Read the component for the current module order; it changes often.

Between-weeks specifics worth knowing: the post-week recap (`components/hub/week-recap-section.tsx`, data from `lib/queries/week-recap.ts`) leads the page until the Thursday morning cron (06:00 UTC daily sync, `isRecapWindowOpen` in `lib/hub/week-recap.ts`); Thursday daytime is the slate-only view. The recap sits in the main column so phones see it, and it renders only when every prior-week matchup is `complete`.

## Animation Philosophy

- No page transitions, no scroll-triggered animations, no loading spinners on server-rendered pages.
- **Allowed:** live score pulse (`@keyframes live-pulse`, CSS), draft countdown tick (opacity transition), card hover border (150ms), tab content fade (100ms), scroll-reveal on first paint, hide-on-scroll mobile bottom dock (`components/nav/scroll-chrome.tsx`, CSS transform). The `prefers-reduced-motion` block neutralizes all of these.
- Movement is reserved for live data where it conveys real information.
