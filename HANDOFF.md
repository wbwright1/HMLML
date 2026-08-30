# Handoff: issue #225 (The Book 4/4: hub integration)

Paused mid-implementation (user going offline). This is a WIP commit, not
ready for PR. Branch: `feat/225-book-hub-integration`, based on
`origin-https/prod` @ d3b5a62 (PR #230 squash-merged the foundation there;
do NOT rebase onto the old `feat/222-the-book-foundation` branch, it's stale).

## Done so far

1. **lib/book/shared.ts**: added pure hub-footer helpers, unit tested in
   `lib/book/shared.test.ts` (20/20 passing via `npx vitest run lib/book/shared.test.ts`):
   - `bookLineText(game)` -> "CT -3.5 · ML -165/+140"
   - `bookConsensusText(game)` -> "64% on CT" or null under `MIN_PICKS_FOR_CONSENSUS`
   - `bookCtaLabel(status)` -> "Pick →" (open) / "The Book →" (live/final)
   - `bookDogPayoutLine(game, stake?)` -> "A $10 friendly on WW +140 pays $14.00 if it lands."
   - `buildHubLineFooter(game): BookLineFooter` -- assembles all of the above;
     `dogPayoutLine` only set when `status === "open"`.
   - New `HubFooterGame` type (structural subset of `BookGame`) and
     `BookLineFooter` interface, both exported from shared.ts.

2. **components/book/line-footer.tsx** (NEW): `BookLineFooterRow` presentational
   component (line text + consensus + gold CTA link to /book, plus italic
   dog-payout line), shared by both card hosts below. Re-exports `BookLineFooter`
   type from `lib/book/shared`.

3. **components/live-matchup-card.tsx**: restructured the root from a single
   `<Link>` to `<div className="card-surface ...">` wrapping the `<Link>` (main
   clickable body) + an optional sibling footer div (`bookFooter` prop), because
   nesting an `<a>` (the /book CTA) inside the card's own matchup-detail `<a>`
   is invalid HTML. Added `bookFooter?: BookLineFooter` prop, renders
   `<BookLineFooterRow>` in a bordered-top footer when present. Link corner
   radius adjusts (`rounded-t-[14px]` vs `rounded-[14px]`) depending on whether
   a footer is present.

4. **components/hub/slate-card.tsx**: added optional `bookFooter?: BookLineFooter`
   prop, renders the same `BookLineFooterRow` in a `mt-3 pt-3 border-t` block.
   (SlateCard has no outer link to worry about, simpler case.)

5. **components/hub/shared.tsx** (`GameCard`): added optional `bookGame?: BookGame`
   prop (type from `lib/queries/book`), computes
   `bookFooter = bookGame ? buildHubLineFooter(bookGame) : undefined` and passes
   it to `<LiveMatchupCard bookFooter={bookFooter} />`. **Important finding**:
   `PairedMatchup.homeTeam`/`awayTeam` are sorted by `rosterId.localeCompare`
   (lexicographic string sort), while `BookGame.home`/`away` are pinned to the
   numerically-lower roster_id (`lib/book/pricing`/`lib/queries/book.ts`
   `pairRosterIds`, `Number(x) - Number(y)`). These CAN disagree for a 12-team
   league once a roster_id hits double digits (e.g. "10" vs "2": lexicographic
   puts "10" first, numeric puts "2" first). This does NOT matter for the line
   footer text itself (it's a self-contained fact about the game, not tied to
   display order), but keep it in mind if a future feature needs to show
   BookGame home/away next to PairedMatchup home/away visually — they are not
   guaranteed to be the same physical side.

## NOT done yet (next steps, in order)

1. **Wire real data through** to `GameCard` in
   `components/hub/regular-season-hub.tsx`: call `getBookBoard(seasonId,
   seasonYear, week)` from `lib/queries/book.ts` (already exists, reused as-is)
   inside its own try/catch (optional data -- empty-catch is correct, per
   CLAUDE.md: book asides on the hub are optional, `book_lines` can be empty
   pre-first-sync). Build a `Map<number, BookGame>` keyed by `matchupId`, pass
   `bookGame={bookLinesByMatchup.get(matchup.matchupId)}` into each `<GameCard>`
   call (there's one call site in the `isGameWindow` branch of
   `RegularSeasonHub`).

2. **Wire `SlateCard` in `components/hub/between-weeks-hub.tsx`**: same
   `getBookBoard` call (or share the map computed for the between-weeks path),
   look up by `m.matchupId` for each `restOfSlate` entry, build
   `buildHubLineFooter(bookGame)` and pass as the new `bookFooter` prop to
   `<SlateCard bookFooter={...} />`. Consider (optional, not required by the
   issue) whether `GameOfTheWeekCard` should also get a footer -- the issue text
   only explicitly names `slate-card.tsx` + regular-season hub, so leaving GOTW
   alone is defensible; use judgment.

3. **The gold Book rail card** (client island, NOT started):
   - New `components/book/book-rail-island.tsx`, `"use client"`. Add it to the
     CLAUDE.md client-island enumeration (the list already includes "the book
     tab pill" and "the book board island" -- append this one with the same
     justification: `/` (the hub) is ISR-cached, so the member's own slip
     record cannot be server-rendered).
   - Pattern: mirror `components/smack-composer-slot.tsx` /
     `components/book/board-island.tsx`. Use `useSessionMember()` for the
     session. Props from the server: `week: number`, `games: BookGame[]` (or a
     narrower shape -- these are public board data, safe to bake into cached
     HTML), and a server-computed **league-wide fallback string** for
     signed-out/no-picks-yet visitors, e.g.
     `` `${totalPicks} picks in this week · ${openCount} games still open` ``
     where `totalPicks = games.reduce((n,g)=>n+g.homePicks+g.awayPicks,0)` and
     `openCount = games.filter(g=>g.status==="open").length`. If `totalPicks`
     is 0, use a generic honest fallback instead (no fabricated numbers) --
     something like "The board opens once picks come in."
   - On mount (signed in), `fetch("/api/book/picks")` (existing endpoint, no
     new API route needed) and use `picksForBoardWeek(body?.data, week)` from
     `lib/book/shared.ts` to discard stale-week payloads (same pattern as
     `board-island.tsx`). For each pick whose game has `status !== "open"`
     (i.e. started/live/final), grade it client-side via `gradePick(homePoints,
     awayPoints, pick)` from `lib/book/pricing.ts` (pure, safe to import in a
     client bundle -- no `lib/db` import chain). Compute hits/misses/pushes;
     `formatRecord(hits, misses, pushes)` from `lib/format-record.ts` gives the
     big mono record string. Build a summary line similar to the design's
     `slipSummaryTxt`: "Covering on X of Y locked picks · Z games still open."
     When the member has picks but none are graded yet (e.g. whole week still
     open), don't fabricate a record -- show something honest like "X of Y
     games picked" instead of "0-0".
   - Design reference: `docs/design_handoff_the_book/The Book.dc.html` lines
     ~148-155 (rail card markup) and ~665-673 (record/summary computation
     logic in the mock's script, JS pseudocode only, not literal code to
     copy -- reimplement in TS against the real schema).
   - Visual: gold-tinted card (`accent-gold-light`/gradient per CLAUDE.md rail
     card conventions used elsewhere, e.g. `RailCard tinted` in
     `components/hub/between-weeks-hub.tsx` for the exact gradient recipe),
     kicker "The Book · Week N" in gold, big mono record (`text-stat`), summary
     line (`text-body-sm text-text-secondary`), gold pill CTA "Open the board →"
     linking `/book`.
   - Needs a thin **server wrapper** (e.g. `components/hub/book-rail-card.tsx`,
     plain RSC) that fetches `games`/`week` (reuse the same `getBookBoard` call
     from step 1, don't refetch) and renders `<BookRailIsland ... />`, so
     `regular-season-hub.tsx` stays clean. Card must render nothing (or a
     minimal empty state) when `games.length === 0` -- do not show a rail card
     with a fabricated "0 picks" claim when The Book has no lines yet
     (preseason/offseason or pre-first-sync).
   - Placement: hub's ladder rail, per design, alongside/above
     `StandingsSnapshotCard` in the `isGameWindow` aside AND in the
     `!isGameWindow` branch's ladder section of `regular-season-hub.tsx`.
     Check both branches -- the rail card should probably appear in both, not
     just the live-game-window one.

4. **Playoff-line divider (issue's 3rd bullet): ALREADY IMPLEMENTED, pre-existing.**
   `components/standings-snapshot-card.tsx` already has a full `PlayoffLine`
   component (gold hairline + italic serif "the playoff line" + hairline)
   inserted after the correct rank, using a real playoff projection
   (`isIn`-based) when available and falling back to `playoffLineAfter = 6`
   otherwise. This was shipped long ago in PR #67 / #30 -- verified via
   `git log --oneline -- components/standings-snapshot-card.tsx`. **One small
   true-claim improvement still worth making**: the hardcoded default `6`
   should reference the existing exported constant
   `PLAYOFF_BERTHS = 6` in `lib/queries/divisions.ts` (issue explicitly asks to
   "reuse the seed-count constant ... rather than hardcoding 6"). Change
   `playoffLineAfter = 6` default param to `playoffLineAfter = PLAYOFF_BERTHS`
   and import it. Trivial, ~2 line change, not yet done.

5. **CLAUDE.md updates needed**:
   - Add the new Book rail island to the client-island enumeration bullet
     (search for "the book board island" in the Key Architecture Decisions
     section, extend the sentence).
   - No other CLAUDE.md changes anticipated (nav/project-structure sections
     are already current from #230).

6. **Testing/verification, none done yet**:
   - `npx tsc --noEmit` -- NOT run yet on the current WIP; will likely have
     errors since `regular-season-hub.tsx` doesn't pass `bookGame` yet (that's
     fine, it's an optional prop, should compile) but verify after finishing
     steps 1-3.
   - `npx vitest run lib/book/shared.test.ts` -- 20/20 passing as of this
     commit.
   - Need a new/extended unit test for the playoff-line default constant
     change (or just verify existing `standings-snapshot-card` doesn't have
     tests to update -- check for a co-located test file).
   - Need to verify with `NFL_STATE_OVERRIDE=regular:1:2026:force npm run dev`
     (per task instructions) once hub wiring is done, screenshot desktop +
     mobile.
   - Need one Playwright E2E spec (chromium-only, single spec, never the full
     suite against the live DB per CLAUDE.md/task constraints) covering: hub
     renders line footer + CTA when `book_lines` has a row for the week; hub
     renders with ZERO breakage when `book_lines` is empty (regression guard
     for the "must never break" requirement). Check `e2e/` for existing Book
     specs to extend rather than duplicating setup (e.g. a `book.spec.ts` may
     already exist from the foundation PR).
   - Unit test for the playoff-line placement logic already exists somewhere?
     Check `components/standings-snapshot-card.test.tsx` or similar before
     writing a new one -- issue's acceptance criteria mentions "unit test for
     the divider placement logic" which likely already exists from the earlier
     PR; just verify, don't duplicate.

## Gotchas / notes for whoever continues

- Base branch is `origin-https/prod` @ `d3b5a62`, NOT
  `feat/222-the-book-foundation` (that branch is now stale/superseded --
  PR #230 squash-merged it). If you see 11 diverged commits warning on
  `git status`, that's expected and harmless (comparing against the old
  feature branch ref, not a problem).
- `.env.local` `POSTGRES_URL` is the LIVE league DB -- read-only for this
  task, this PR writes nothing to it.
- Do not run the full Playwright suite against the live Neon DB (quota risk,
  documented in memory). Single spec, chromium-only project only.
- `lib/book/pricing.ts` and `lib/book/shared.ts` are both pure (no `lib/db`
  import), which is exactly what makes them safe to import into
  `components/book/board-island.tsx` (existing client island) and the new
  rail island -- keep it that way, don't accidentally import `lib/queries/book`
  (which pulls in `@/lib/db`) into a client file. `BookGame` the TYPE is fine
  to import client-side (type-only imports are erased), but never import a
  *function* from `lib/queries/book.ts` client-side.
