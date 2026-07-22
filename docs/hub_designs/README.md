# Handoff: HMLML Hub — two new seasonally-aware states

## Scope
This bundle adds **two hub layouts** to the already-redesigned HMLML platform. It does **not** re-specify the whole app — tokens, global chrome (topbar / mobile dock), and the existing screens are already covered by the main platform handoff. Build only the two states below and wire them into the hub's existing season-switching logic.

The hub is already seasonally aware (see `app/page.tsx` → `PreseasonHub` / `RegularSeasonHub`). These two designs replace/expand:
- **1a → the preseason hub** (`seasonType === "pre"`): season has technically started but Week 1 is weeks away, everyone is 0-0.
- **1d → the regular-season hub, "between weeks" branch** (`seasonType === "regular"` and **not** a game window): the Tue/Wed lull after Monday night, before Thursday kickoff. This is the **newsletter replacement**.

`HMLML Hub States.dc.html` also contains two alternates that were **not** chosen (1b "The Cover", 1c "The Receipts") — ignore them; they're left in only as reference.

## About the design files
`HMLML Hub States.dc.html` is an HTML prototype in a house format (`<x-dc>` wrapper + `support.js` runtime) — a visual reference, **not** production code. Recreate it in the target codebase (Next.js / React Server Components, per the existing app) using the project's components and Tailwind tokens. Lift exact values from this README and the existing global handoff; use the HTML only for structure and proportion. All data shown is placeholder (12 teams, 2026 preseason / 2025 Week 10).

Fonts: Instrument Serif (italic, display), Geist (UI), JetBrains Mono (all numerals). Tokens are identical to the main handoff (bg `#1A1613`, ink `#F2EADC`, muted `#98917F`, dim `#6E6759`, gold `#E2B858`, positive `#8FBF7F`, negative `#C97C6A`; card = `linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02))` + `1px rgba(255,255,255,.08)` border + `0 24px 60px rgba(0,0,0,.30)` shadow, 14px radius).

Key difference from the live hub: **no standings/rankings in the preseason state** (everyone is 0-0), and the between-weeks state leads with editorial + recap, not live scores.

---

## 1a · Preseason Hub ("The Field")
**When**: `seasonType === "pre"` — new league year, Week 1 not yet started.
**Voice**: countdown + division rivalries + preseason trash. No rankings.

### Desktop (1280 shell)
1. **Countdown hero** — kicker (`LEAGUE · 2026 · TITLE DEFENSE LOADING`), serif headline ("The season's on the clock."), dek. Right: 3 countdown cards **DAYS / HRS / MIN** to Week 1 kickoff (big mono numerals). Live pill in topbar reads `PRESEASON · WK 1 IN 34D` with a **static gold dot** (no pulse — nothing is live).
2. Two-column grid `1fr 340px`.
   - **Left — "The Field · Grouped by Division"**: 3 cards, one per division (Silverback / Mustard / Dynasty). Each card: division name + a serif one-line characterization, then its 4 teams (dynasty crest + name + last-season record, or a `CHAMP` / `DOORMAT` / `R-UP` tag), then a serif rivalry note pinned to the bottom (e.g. "GW vs HS is 14-9 all-time. HS has dropped the last four.").
   - **Left — "Bold Predictions · Site Desk"**: 2×2 cards, each a kicker label + a `LOCK`/`NO`/`▲`/`▼` verdict chip + a bold call (site voice).
   - **Left — "Offseason Receipts"**: 2×2 cards (Draft / Blockbuster Trade / Waivers / The Fire Sale), each with a category kicker + a small team crest + 1-2 lines.
   - **Right rail — "Burning Questions"**: numbered list (serif numerals) of 3 storylines.
   - **Right rail — "The Smack Feed"**: member-posted trash cards (crest + team name + timestamp + quote).
3. Mobile dock / bottom tab bar unchanged from global chrome.

### Mobile (390 shell)
Header (wordmark + `WK 1 IN 34D` pill) → serif hero + 3 countdown cards → one division card (Silverback) → 2 smack-feed cards → bottom tab bar.

### Data (1a)
- Countdown target: league Week-1 kickoff datetime (`NEXT_PUBLIC_DRAFT_DATE` sibling — add a kickoff date). Render days/hrs/min, tick client-side (existing `DraftCountdown` pattern).
- Divisions: `franchises` grouped by `division_id` (3×4). Last-season record from the last completed season's standings.
- Rivalry notes + burning questions + bold predictions: **editorial/site-voice content** — sits in the centralized content system (`lib/content.ts`), keyed by division / matchup. All-time H2H numbers come from historical matchups.
- Offseason receipts: recent `transactions` (draft picks, trades, waivers) for the new league year, curated.
- Smack feed: member-submitted posts (new data type — see "Smack feed" note below).

---

## 1d · Between-Weeks Hub ("The Week Ahead")
**When**: `seasonType === "regular"` and no live game window (Tue/Wed). Replaces the between-weeks newsletter.
**Voice**: anticipation-forward — the week ahead first, last week's receipts compressed into the rail.

### Desktop (1280 shell)
1. **Countdown hero** — kicker (`… · WEEK 10 · THE SLATE IS SET`), serif headline ("Two days until it matters again."), dek. Right: 3 countdown cards **DAYS / HRS / MIN** to Thursday kickoff. Topbar pill: `WK 10 · KICKOFF THU 8:15` (static gold dot).
2. Two-column grid `1fr 340px`.
   - **Left — "Game of the Week"**: a feature card (gold-tint gradient + a gold radial blob). Both teams (crest + name + record + a one-line status), a centered serif "vs", all-time H2H line top-right, and a serif trash-laced blurb under a hairline.
   - **Left — "The Rest of the Slate"**: 2×2 matchup preview cards. Each: "Team vs Team" + all-time H2H record (mono) + a serif one-line trash angle.
   - **Left — "The Smack Feed · Week 10"**: 2×2 member-posted cards (crest + name + timestamp + quote), directly under the slate. `member-posted · N new` meta on the right of the header.
   - **Right rail — "Week 9, In the Books"**: compact recap strip (High / Mercy / Close / Stinker rows) + "Full recap →" link.
   - **Right rail — "Left On The Bench"**: the **highest-possible / optimal-lineup** callout (big mono points-left number + a line: "Optimal was 149.7, he started 111.1.").
   - **Right rail — "Week 9 Standouts"**: Player of the Week + Dud Starter cards (headshot + name + team·pos + mono points).
   - **Right rail — "Trending"**: player rows — headshot + name + team·pos + a one-line reason + an up/down arrow (**no percentages**).
3. Bottom tab bar unchanged.

### Mobile (390 shell)
Header (`WK 10 · THU 8:15`) → serif hero + 3 countdown cards → Game of the Week card → 2 slate preview cards → bottom tab bar. (Recap/awards/trending live on the desktop rail; on mobile keep the top of the funnel — hero, game of the week, slate.)

### Data (1d)
- Countdown target: next Thursday kickoff datetime.
- Game of the Week + slate: current week's `matchups` (upcoming, not yet played) + all-time H2H from historical matchups. Which game is "of the week" = editorial pick or a heuristic (division + records).
- Trash angles / blurbs: site-voice content keyed by matchup (`lib/content.ts`).
- Last week's damage / awards: existing weekly-superlatives queries for `week - 1` (High Score, Mercy Rule/blowout, closest, lowest = "Stinker"; Player of the Week, Dud Starter).
- **Left on the bench (optimal lineup)**: compute each team's best-possible lineup for `week - 1` from actual player scores vs slot eligibility; surface the team that left the most on the bench (points left, optimal total, actual total). New calc — co-locate as `lib/optimal-lineup.ts` with unit tests.
- Trending: existing players trending endpoint (adds/drops); show 2-3 with a short editorial reason instead of raw %.
- Smack feed: member posts (below).

---

## Newsletter → hub mapping
The old between-weeks newsletter maps onto 1d (+ the preseason 1a) as follows:

| Newsletter item | Where it lives |
|---|---|
| Best team | Team of the Week ("Week 9 Standouts", 1d rail) |
| Worst team | Bust of the Week (superlatives; shown in 1c alt, add to 1d rail if wanted) |
| Players of the week | Player of the Week (1d rail) |
| Dud starter of the week | Dud Starter (1d rail) |
| Highest possible team | "Left On The Bench" optimal-lineup callout (1d rail) |
| Matchup of the week | "Game of the Week" feature (1d) |
| Players to watch (trending up/down) | "Trending" (1d rail) |
| Trash talk | Site-voice blurbs on every module **+** the member Smack Feed (1a & 1d) |

## Smack feed (new data type)
Both states show a **member-submitted** trash-talk feed, separate from the auto-generated site voice. Phase 1 is public/no-login, so this needs a lightweight authoring path (commish-entered, or a simple moderated submission in Phase 2). Suggested shape: `{ id, franchise_id, body, created_at }`, newest first, rendered as crest + team name + relative timestamp + quote. Until it exists, seed from a content constant so the module isn't empty.

## Files
- `HMLML Hub States.dc.html` — prototype of all four explorations; **build 1a and 1d only**. Requires sibling `support.js` to render locally (reference only, do not port).
- `screenshots/` — `1a-preseason-desktop/-mobile`, `1d-between-weeks-desktop/-mobile` (PNG, mobile @2×).
- Global tokens, chrome, and the other screens: see the main platform handoff (`design_handoff_hmlml_platform`).
