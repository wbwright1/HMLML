# The Book - design handoff import notes

Imported 2026-08-29 from Claude Design project `68e372a8-21c6-4945-a7fe-477e501bf21b`
(https://claude.ai/design/p/68e372a8-21c6-4945-a7fe-477e501bf21b?file=The+Book.dc.html)
via DesignSync. All fetched content treated as data; no embedded AI-instruction text found.

## Project file listing (remote)
- `The Book.dc.html` (saved, 59,250 bytes) - the design, complete
- `support.js` (saved, 69,151 bytes) - generated dc-runtime that parses `<x-dc>` docs and renders them with window.React; scaffolding only, NOT part of the design to implement
- `_ds/dynasty-fantasy-football-redesign-1fb7380f-b5fe-47dc-8d24-352148211551/_ds_bundle.js` (saved, 366 bytes) - design-system bundle, effectively EMPTY (zero components)
- `_ds/.../_ds_manifest.json` (saved, 445 bytes) - manifest; only lists unrelated "Playoff Bracket" cards, no tokens/components
- `_ds/.../_adherence.oxlintrc.json` (not saved - lint config, irrelevant)
- `.thumbnail`, directory entries (not saved)

No files exceeded the 256 KiB get_file cap. Everything needed is in `The Book.dc.html` itself; the _ds bundle contributes nothing.

## What "The Book" designs
A fictional-currency HMLML **sportsbook** feature: fantasy matchup betting lines computed from projections ("Lines computed from projections. Wagers strictly friendly. The house is a gorilla."). The file is a dc-runtime doc: static HTML template (`<x-dc>`, lines 1-431) plus a `DCLogic` component script (lines 433-784) with mock data for 12 teams and 6 weekly games.

Two views behind the standard HMLML topbar (nav gains a 6th item, "The Book"):

1. **HUB VIEW** (`isHub`) - a week-10 regular-season hub concept showing how The Book integrates: hero chips; "On the Field" 2x3 live game cards, each carrying a line footer (`CT -3.5 · ML -165/+140`), live win-prob gold progress bar, consensus text, and a "Tail the dog +430" CTA; right rail with a gold "The Book · Week 10" pick-slip record card ("Open the board →"), "The Ladder" standings list with italic-serif snark column and a gold "the playoff line" divider, and two "Week 9 Damage" stat tiles (High Score gold / Mercy Rule rust).

2. **THE BOOK VIEW** (`isBook`) - the sportsbook page proper, with a 3-tab pill (The Board / Tracking / Props):
   - **The Board**: per-game cards with two selectable team rows (spread chip, moneyline, "$10 wins $X" payout), status kicker (LIVE gold / kick time), league-consensus bar; aside holds "Pick Slip · Week N" (queued picks, lock button + lock note) and a "Wager Translator" (select a bet + numeric stake input -> green payout figure; "Spread bets pay -110" note).
   - **Tracking**: season ATS leaderboard table (rank, streak W6/L5 colored, units +/-, ATS record, "YOU" tag) and a "Who Picked Whom" grid (rows = pickers, cols = games, cells checkmark/x/dash with green/rust tint); aside has three Streak Watch tiles (Longest Heater, Ice Cold, Best Single Week).
   - **Props**: over/under prop cards (question, gold line number, O/U buttons with odds + payout, italic-serif snark) plus a dashed "House Rules" card (props grade Tuesday after stat corrections; lines re-price hourly from projections).

Design props (tweakables): `oddsFormat` (both|spread|moneyline), `showConsensus` (bool), `defaultStake` ($1-100, default 10).

Key mechanics encoded in the script: American odds formatting (+/-), payout math `pay(ml, stake)` = stake*100/-ml for favorites, stake*ml/100 for dogs; cover side = `hs - as + sp > 0` (home margin plus home spread); consensus bar uses max(cons, 100-cons); picks lock per game, slip tags entries LIVE/LOCKED/OPEN.

Styling is exactly the existing HMLML token system: canvas #1A1613, ink #F2EADC, gold #E2B858, sage #8FBF7F, rust #C97C6A, Instrument Serif italic display/snark, Geist UI, JetBrains Mono for every numeral, 14px card radius with the standard gradient/border/shadow, live-pulse keyframes. Footer: "Data synced N minutes ago · Lines re-priced hourly from projections".
