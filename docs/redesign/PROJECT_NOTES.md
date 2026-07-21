# HMLML Dynasty Fantasy Platform — project notes

## Chosen direction
- Visual language: **Command Center** (turn 3 in `HMLML Redesign.dc.html`).
- Theme: **5b — Warm Charcoal & Gold** (dark). Tokens:
  - bg `#1A1613`, surface `rgba(255,255,255,.045)`, hairline border `rgba(255,255,255,.08)`
  - ink `#F2EADC`, muted `#98917F`, dim `#6E6759`
  - accent gold `#E2B858`, accent tint `rgba(226,184,88,.13)`
  - positive/up `#8FBF7F`, negative/down `#C97C6A`
  - display: Instrument Serif (italic); UI: Geist; numerals: JetBrains Mono (tabular)
- Mobile nav: thumb-reach dock = persistent search bar over a 5-icon tab bar (Hub, Teams, Records, Drafts, Players). Desktop: pill topbar with inline search (⌘K).
- Full screen mocks: `HMLML Platform.dc.html` (Hub, Matchup Detail, Roster, Records & Standings, Draft Board, Players — desktop + mobile each).

## Imagery & asset requirements — MUST be in the Claude Code handoff doc
1. **Player headshots** wherever a player is shown (roster, matchup lineups, player rows/detail, draft picks, trending). Circular crop. Source: headshot CDN keyed by player ID (Sleeper/ESPN-style). Fallback: 2-letter monogram.
2. **NFL team logos per player** — the player's real pro team (e.g. Mahomes → Chiefs). Rendered as a small badge on the headshot AND inline beside `TEAM · POS`. Also the primary mark on D/ST roster slots. Source: 32-team logo set keyed by team abbreviation.
3. **Dynasty (fantasy) team logos per team** — each league team's own logo replaces the initials avatar (GW, TP, …) everywhere teams appear: Hub game cards, ladder, standings, roster header, matchup header, draft board. Rounded-square crop. Source: user-uploaded per team; fallback: 2-letter monogram on the gold gradient.

Note: mocks show these as placeholder shapes (headshot silhouette + logo badge, shield/crest) marking placement and size; real sources are wired at build time. See the "Imagery & Assets" legend at the top of `HMLML Platform.dc.html`.

## Data
- Placeholder HMLML league data throughout (12 teams, Week 10). Real league data to be provided later.
