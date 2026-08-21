# Handoff: HMLML Playoff Bracket ("The Road")

## Overview
A true left-to-right tournament bracket for `/playoffs/[seasonYear]`, replacing the current three-stacked-cards layout (`components/playoff-bracket-rounds.tsx`). Rounds are columns; match cells converge through elbow connector lines into the next round; first-round byes are pass-through cells; the bracket terminates in a **champion capsule**. The champion's full route through the bracket is traced in gold ("the champion's road"); the Toilet Bowl traces its sinker's route in rust ("the drain").

Design files (static HTML references, open in any browser; not production code):
- `bracket-desktop.html` — full page, 1080px stage: Championship Bracket + Toilet Bowl, each with a placement-games lane.
- `bracket-mobile.html` — 390px shell: same bracket geometry inside a native horizontal-scroll track with a right-edge fade and a "swipe" hint; placement games stack full-width below.
- `bracket-cells.html` — the Tier 1 match cell in every state (decided, Toilet Bowl inverted, bye, TBD feeder, championship, champion capsule).

All data shown is the real 2025 bracket (Olave Garden over Vanilla Vick in HMLML Bowl V; Latter Day Lamb Special "won" the Toilet Bowl).

## Bracket geometry (desktop stage, 1080×648)
- Match cell: 248×76 (two 37px team rows + hairline divider), radius 10, card-gradient fill, `--border` hairline.
- Round 1 column at x=0; four slots with tops 44/152/260/368 (108px pitch). Slot order is pairing order: bye(1-seed), match feeding it, bye(2-seed), match feeding it — so connectors never cross.
- Semifinal cells (x=284) vertically centered over their two feeders (tops 98/314); the final (x=568) centered over the semis (top 206); champion capsule at x=852, 228×132.
- Connectors: 1px `--border-strong` elbows — 18px stub out of each feeder, shared vertical join, 18px stub into the destination. Final → capsule is a single 36px line.
- Champion's road: the winning team's exact path re-traced with 2px gold segments layered above the base connectors (rust in the Toilet Bowl).
- Placement lane: kicker `PLACEMENT GAMES` at y=508; placement cells (labeled header strip + two 33px rows) sit under the column of the round they were played in (5th Place under Semifinals, 3rd Place under Championship).

## Match cell anatomy
Row: `seed (mono 10px dim, winners bracket only) · 8px branding-color dot · name (12.5px, truncates) · result label · score (mono, tabular)`.
- Advancing team: raised row (`--surface-muted`), bold ink name, gold "W" chip (`--accent-gold` on `--accent-gold-light`), bold ink score.
- Eliminated: dim "OUT" text label, dim score, regular weight. Never color alone; every state carries a text label.
- Toilet Bowl (inverted): advancing-by-losing row gets `--accent-warm-light` tint, "SANK" rust chip, rust bold score; the higher scorer gets "ESC"/"ESCAPED". No W/L glyphs in the Toilet Bowl.
- Bye cell: dashed border, no fill, name row + italic "First-round bye"; same footprint so geometry holds; connector runs straight through.
- TBD feeder: dim italic feeder line, hollow dot, en-dash score. Copy: "Winner of Match N" in the winners bracket, "Sinker of Match N" in the Toilet Bowl (the team that advances there is the loser, so "Winner of…" would be wrong).
- Final cell: gold hairline ring (`rgba(226,184,88,.3)` border + 1px ring). Toilet Bowl final: same ring in rust. Gold is reserved for the real title.
- Champion capsule: gold-tint gradient card, kicker "YYYY CHAMPION", serif italic name, "HMLML Bowl N · score–score" sub, trophy SVG. Rust variant: "TOILET BOWL CHAMPION", "12th of 12 · score in the final", double-chevron drain glyph.
- Every cell with a played week links to `/seasons/[year]/week/[week]`, as today.

## Mobile (390px)
Same stage scaled (cells 200×64, stage 874×440) inside `overflow-x: auto` with a canvas-colored right-edge fade and a kicker-style swipe hint ("Swipe to follow the road →" / "…the drain →"). A bracket is the sanctioned exception to the no-horizontal-scroll rule; placement games leave the stage and stack as full-width cells below it. Round headers live inside the scroll track above their columns.

## Tokens & type
Standard Command Center tokens (see CLAUDE.md). Mocks use font fallbacks; production uses Instrument Serif italic (titles, capsule names), Geist (UI), JetBrains Mono (every numeral, tabular). Seeds and week numbers are mono.

## Data mapping
Everything renders from the existing `getSeasonBrackets` query (`lib/queries/playoff-bracket.ts`):
- Column = `BracketRound` (label + week already computed). Slot order within round 1 must be re-derived from round 2's `team1FromMatch`/`team2FromMatch` so feeder pairs are adjacent and connectors never cross; byes are the round-2 teams with no feeder match.
- Placement games = matches with `placement != null` (except the final, placement 1): pull them out of the round columns into the placement lane, labeled by `placementLabel`.
- Champion capsule = advancing team of the placement-1 match; bowl name from `lib/bowl-names.ts`; Toilet Bowl copy from `TOILET_BOWL_COPY` in `lib/playoff-labels.ts`.
- Connector geometry is pure layout; no new data. Undecided brackets render the same stage with TBD cells and no gold/rust road.

## Accessibility
- Advancement is never color-only: "W"/"OUT" in the winners bracket, "SANK"/"ESCAPED" in the Toilet Bowl, plus weight and row-tint differences.
- Rust (not red) for all negative signals; sage/gold positive; no red/purple pairing anywhere.
- Connector lines are decorative; the DOM order (round by round, match by match) tells the same story to screen readers, and each cell keeps its `data-testid`/`data-state` contract from the current component.
