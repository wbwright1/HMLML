# Handoff: HMLML Dynasty Fantasy Platform

## Overview
HMLML (Harambe Memorial League) is a 12-team dynasty fantasy football platform. This is a full visual redesign — "Command Center" language in a premium dark theme — covering six core screens, each in desktop and mobile form factors. The design emphasizes an all-games-live weekly hub, dense-but-legible tables, and a distinctive editorial voice (serif display type, gold accent, tabular-mono numerals).

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that show the intended look, layout, and behavior. They are **not production code to copy directly**. `HMLML Platform.dc.html` in particular is authored in a house prototyping format (a `<x-dc>` wrapper + `support.js` runtime) and will not run outside this environment.

Your task is to **recreate these designs in the target codebase's environment** (React/Next, Vue, SwiftUI, native, etc.) using its established component patterns, styling approach, and libraries. If no app environment exists yet, choose an appropriate stack (a React + CSS-in-JS or Tailwind SPA is a natural fit) and implement there. Lift the exact tokens and measurements from this README; use the HTML only to understand structure and proportion.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and layout are specified below and should be recreated faithfully. The one abstraction: imagery (headshots, logos) is shown as placeholder shapes — see **Assets**.

## Design Tokens

### Color (theme: "Warm Charcoal & Gold", dark)
| Token | Value | Use |
|---|---|---|
| `bg` | `#1A1613` | app / card background |
| `surface` | `rgba(255,255,255,.045)` | chips, search fields, tab bar |
| `surface-gradient` | `linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.02))` | primary cards |
| `border` | `rgba(255,255,255,.08)` | hairline borders |
| `divider` | `rgba(255,255,255,.05)` | row separators |
| `ink` | `#F2EADC` | primary text |
| `muted` | `#98917F` | secondary text |
| `dim` | `#6E6759` | tertiary / disabled |
| `accent` (gold) | `#E2B858` | brand, active nav, links, key numbers |
| `accent-tint` | `rgba(226,184,88,.13)` | active pill/row background |
| `accent-gradient` | `linear-gradient(140deg, #E2B858, #8E6E2A)` | gold team crest, primary avatar |
| `positive` / up | `#8FBF7F` | live dot, win, ▲ |
| `negative` / down | `#C97C6A` | loss, mercy-rule, ▼, doormat |
| Position chips | QB `#C97C6A`, RB `#8FBF7F`, WR `#E2B858`, TE `#7FA8C9`, K `#9B8FC9`, D/ST `#98917F` | draft board / filters |

Card inner glows: two radial-gradient blobs, top-left gold `rgba(226,184,88,.09)`, top-right sage `rgba(120,150,110,.06)`, `pointer-events:none`.

### Typography
- **Display**: Instrument Serif, italic — screen titles ("Week Ten.", "The Records."), logo wordmark, editorial asides ("league doormat", "the playoff line").
- **UI**: Geist — all labels, body, buttons. Weights 400/500/600/700/900.
- **Numerals**: JetBrains Mono, `font-variant-numeric: tabular-nums` — all scores, records, stats, ranks.
- Section kickers: 10–11px, weight 600, `letter-spacing:.18em`, uppercase, color `muted`.
- Title sizes: desktop hero 40–56px; mobile hero 30–44px.

### Radius / shadow / spacing
- Radius: cards 14px; desktop shell 16px; mobile shell 26px; chips/fields 10–11px; pills 999px; tab bar 18px; dynasty logo crest ≈28% of its size (rounded square).
- Card shadow: `0 24px 60px rgba(0,0,0,.30)`; inset top highlight `inset 0 1px 0 rgba(255,255,255,.06)`.
- Screen padding: desktop 28px horizontal; mobile 16–20px. Section gaps 22–36px.

## Screens / Views
Each screen has a **desktop** (1280px wide shell) and **mobile** (390px wide shell) variant.

### Global chrome
- **Desktop topbar** (64px): serif "HMLML" wordmark · pill nav [Hub, Teams, Records, Drafts, Players] (active = accent-tint bg + gold text) · right: inline search field (230px, ⌘K hint) + "6 GAMES LIVE" pill (pulsing green dot) + current user's dynasty crest.
- **Mobile dock** (bottom, thumb-reach): a persistent **search bar** ("Search teams, players, records…" + FILTER chip) sitting directly above a **5-icon tab bar** (Hub/Teams/Records/Drafts/Players, icon + 9px label, active = accent-tint + gold). This replaces a top nav — search and nav are both at the bottom by design.
- **Mobile header** (56px): wordmark + "6 LIVE · WK 10" pill.
- **Live dot**: 6px green dot with an expanding pulse ring (`@keyframes` scale 1→2.4, opacity .75→0, 1.6s infinite).

### 01 · Hub
- **Purpose**: weekly league home; all 6 matchups run simultaneously.
- **Desktop layout**: hero row (kicker + "Week Ten." + 3 stat cards: High Score, Closest Game, Players Left) → two-column grid `1fr 340px`: left = "ON THE FIELD · ALL LIVE" 2×3 grid of game cards; right rail = "THE LADDER" (12-row standings with a playoff-line divider after row 6) + "WEEK 9 DAMAGE" (High Score / Mercy Rule cards).
- **Game card**: LIVE label + status meta (e.g. "4 TO PLAY" / "GAME OF THE WEEK" in gold); two team rows (crest + name + mono score; winner in ink, loser in muted); win-probability bar (gold fill); footer win-prob % + aside note.
- **Mobile**: hero + 3 stat chips → 2 game cards + "4 more live games ↓" → condensed ladder (top 4, playoff line, #7, doormat).

### 02 · Matchup Detail
- **Purpose**: single game deep-dive with live lineups.
- **Desktop**: back link → hero card (grid `1fr auto 1fr`: team crest+name+record | big mono "112.4 · 74.1" + LIVE status | opponent) with a thick win-prob bar and 88%/12% split → two side-by-side starter tables (one per team): position slot, player headshot+badge, name + matchup, points (projected shown in muted for players yet to play). Bench summary + projected total below each.
- **Mobile**: back link → compact score card → single comparison table (left team pts | centered position label | right team pts, each side with headshot) → per-side projected totals.

### 03 · Team · Roster
- **Purpose**: manage a team's lineup.
- **Desktop**: team header (dynasty crest + serif team name + "YOUR TEAM" chip + record line + "Switch team ▾") → grid `1fr 300px`: left = "STARTING LINEUP" table then "BENCH & IR" table (cols: SLOT, PLAYER [headshot+name], MATCHUP, PTS, PROJ, ROST%); right rail = "TEAM SNAPSHOT" key/value list + "NEXT MATCHUP" card.
- **Mobile**: condensed header → starting lineup list (headshot, name+opp, proj+rost%) + projected total → bench & IR list.

### 04 · Records & Standings
- **Purpose**: full standings + league record book.
- **Desktop**: title "The Records." → grid `1fr 320px`: left = full standings table (#, TEAM [crest+name], REC, PF, PA, STRK [green W / red L], GB; row 1 highlighted; top-6 = playoff berth, legend below); right rail = "THE RECORD BOOK" 2×2 stat cards + "POWER RANKING · WK 10" list.
- **Mobile**: standings list (rank, crest, name+PF, rec, streak) → record book 2×2.

### 05 · Draft Board
- **Purpose**: 2025 rookie draft, snake format, completed.
- **Desktop**: title + position-color legend → board card: 12 column headers (dynasty crest + abbr), then a `repeat(12, 1fr)` grid of pick cells (4 rounds shown, snake order). Each cell: "rd.pk" + position (colored) + player name.
- **Mobile**: round selector pills (Round 1 active) → pick list for the round (pick #, drafting team's crest, player name, position chip).

### 06 · Players
- **Purpose**: browse the player universe.
- **Desktop**: title "Players." → filter row (position pill tabs All/QB/RB/WR/TE/K/D-ST + search field + Filters button) → grid `1fr 300px`: left = players table (PLAYER [headshot+name+team·pos], AVG, PROJ, ROST%, TRD [▲/▼/—]); right rail = "TRENDING · ADDS" list + a **player detail card** (large headshot, name, team·pos·rank, 2×2 stat grid: AVG/PROJ/SNAP%/TGT-G).
- **Mobile**: title → position chips → player list (headshot, name+team·pos, avg, trend arrow).

## Interactions & Behavior
- **Navigation**: topbar pills / bottom tabs switch primary sections; active state = accent-tint background + gold text/icon. "Matchup detail →", "Records →" and card taps route to detail screens. Back link returns to Hub.
- **Live state**: games marked LIVE show the pulsing green dot; scores/win-prob update in real time (poll or socket). Players yet to play show projected points in `muted`; completed show actual in `ink`.
- **Search**: desktop ⌘K opens/focuses the topbar field; mobile field is always visible in the dock. Type-ahead across teams, players, records.
- **Draft board**: snake ordering (odd rounds L→R, even rounds R→L). Cells are read-only in recap; hover could surface pick detail.
- **Filters (Players)**: position pills filter the table; Filters button opens advanced filters (roster status, availability, etc.).
- **Responsive**: two distinct layouts (desktop ≥ ~1024px uses topbar + multi-column; mobile uses stacked single column + bottom dock). Right rails collapse below the main content on mobile.
- **Motion**: keep transitions subtle (150–200ms ease) for nav/hover; the only ambient animation is the live-dot pulse.

## State Management
- **Global**: current user/team, selected season + week, theme (dark only for now — tokens are centralizable for a future light theme, ref 5a).
- **Hub**: list of matchups (teams, live scores, players-remaining, win prob, status), standings/ladder, weekly "damage" superlatives.
- **Matchup**: per-team starters/bench with player, slot, pro matchup, actual + projected points; win probability.
- **Roster**: team's lineup by slot, bench, IR; team snapshot stats; next opponent.
- **Records**: full standings (W-L, PF, PA, streak, games-back), record book entries, power ranking.
- **Draft**: picks keyed by round × slot (player, position, drafting team).
- **Players**: paginated/filterable player list (avg, proj, rostered%, trend), trending adds, per-player detail stats.
- **Data**: currently placeholder HMLML data (12 teams, Week 10). Real league data + live scoring feed to be wired in.

## Assets
Three real-image asset types are shown as **placeholders** in the mocks (see the "Imagery & Assets" legend at the top of `HMLML Platform.dc.html`). All must be implemented:

1. **Player headshots** — everywhere a player appears (roster, matchup lineups, player rows + detail, trending). Circular crop. Sizes: 26–32px in rows, 52px in detail. Source: a headshot CDN keyed by player ID (Sleeper/ESPN-style). Fallback: 2-letter monogram.
2. **NFL team logos (per player)** — the player's real pro team. Rendered as a small badge on the headshot (bottom-right, ≈50% of headshot size) **and** inline in the "TEAM · POS" text. Also the primary mark on D/ST roster slots. Source: a 32-team logo set keyed by team abbreviation (BUF, CIN, …). In the mocks this badge is a gold shield placeholder.
3. **Dynasty (fantasy) team logos** — each league team's own logo. Replaces the initials avatar (GW, TP, HS, …) **everywhere teams appear**: hub game cards, ladder, standings, roster header, matchup header, next-matchup, draft board headers/picks, topbar user crest. **Rounded-square** crop (distinct from the circular player headshots). Source: user-uploaded per team; fallback: 2-letter monogram on the gold gradient.

Icons in the mocks (nav home/teams/records/drafts/players, search, back, filter, shield) are simple inline stroke SVGs — replace with the codebase's icon set at matching weight (~1.7 stroke).

Fonts: Geist, Instrument Serif, JetBrains Mono (Google Fonts).

## Files
- `HMLML Platform.dc.html` — the six-screen platform mock set (desktop + mobile each) with the imagery/asset legend. **Primary reference.**
- `HMLML Redesign.dc.html` — the exploration history: turns 1–2 (early directions), turn 3 (the chosen "Command Center" language), turn 4 (light palette options), turn 5 (chosen 5b dark + dark alternates), turn 6 (a colorblind-safe variant, for reference if accessibility work is prioritized).
- `PROJECT_NOTES.md` — condensed project notes (theme tokens, nav pattern, asset requirements).

Both `.dc.html` files require their sibling `support.js` to render locally and are design references only — do not port them directly.

## Screenshots
Rendered PNGs of every screen are in `screenshots/` (desktop @1×, mobile @2×):
`01-hub`, `02-matchup`, `03-roster`, `04-records`, `05-draft`, `06-players` — each with `-desktop` and `-mobile` variants.
