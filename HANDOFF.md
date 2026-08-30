# HANDOFF: issue #224 - The Book Props tab

## Status: early, paused mid-implementation (research + pricing engine only)

Branch: `feat/224-book-props`, based on `origin-https/feat/222-the-book-foundation`
(commit 063ebca). **NOTE**: coordinator says PR #230 (the foundation) was
squash-merged into `prod` as `d3b5a62`, so before pushing further you must:

```
git fetch origin-https prod
git rebase --onto origin-https/prod 063ebca
```

This branch was cut before that rebase happened, so the first real step on
resuming is to do that rebase (content should be identical/trivial).

## What's done

- Read issue #224 and epic #221 in full (via `gh api repos/wbwright1/HMLML/issues/224`
  and `.../221` - `gh issue view` is empty in this env).
- Read all foundation reference files: `lib/book/pricing.ts`, `lib/sync/book-lines.ts`,
  `app/actions/book.ts`, `app/api/book/picks/route.ts`, `lib/queries/book.ts`,
  `lib/book/shared.ts`, `components/book/board-island.tsx`, `components/book/book-tabs.tsx`,
  `app/book/page.tsx`, migration `0014_the_book.sql`, schema.ts book_props/book_prop_picks
  section (lines ~728-815), `lib/sync/hourly.ts` (syncBookLines step + runHourlySync,
  ~line 990-1345), `lib/sync/daily.ts` (runDailySync, ~line 1330), `lib/win-probability.ts`,
  `lib/queries/kickoff.ts`, design handoff `docs/design_handoff_the_book/The Book.dc.html`
  (Props tab markup ~line 391-419, script/data lines ~747-762), existing e2e pattern
  `e2e/book-board.spec.ts`.
- Wrote `lib/book/props.ts` (pure, no I/O) - the pricing/grading engine for all
  three props, mirroring `pricing.ts`'s conventions:
  - `toHalfInteger` - shared half-integer rounding hook (extracted from priceSpread's logic).
  - Prop 1 League Total: `priceLeagueTotal` (flat -115/-105 odds per issue), `gradeLeagueTotal`.
  - Prop 2 Ceiling Watch: `probOverThreshold`/`probAnyoneOverThreshold` (normal-CDF based,
    own `SCORE_UNCERTAINTY_SCALE`), `priceCeilingWatch` (odds via pricing.ts's `americanOdds`),
    `chooseCeilingThreshold` (trailing-2-season P95, default 150 documented), `gradeCeilingWatch`.
  - Prop 3 Mercy Line: `priceMercyLine` (reuses `toHalfInteger`, odds = `SPREAD_ODDS` flat -110
    both sides, reusing pricing.ts's convention rather than inventing one), `gradeMercyLine`,
    `findBiggestFavorite` (pure pairing-selection helper for the week's widest projected margin).
  - Presentation helpers: `formatOverUnderLine`, `propSideLabels`, `formatPropLine`.
- Wrote `lib/book/props.test.ts` - unit tests for all of the above. **NOT YET RUN**
  (`npm run test:unit` was not executed before the pause - do this first on resume,
  there may be arithmetic mistakes, e.g. double check `toHalfInteger` rounding-bucket
  math which is easy to get off-by-one on: `f(v) = Math.round(v - 0.5) + 0.5` buckets
  `[n, n+1)` to `n+0.5`, and `v === n+1` exactly rounds UP into the next bucket because
  `Math.round(x.5)` rounds half-up in JS. Already caught and fixed two wrong test
  expectations from this before pausing; there could be more.).

## What's NOT done yet (the bulk of the work)

1. **DB query layer** - new file `lib/queries/book-props.ts` (planned, not created):
   - `isWeekLocked(seasonYear, week)` - bool_or over `nfl_games.status <> 'pre_game'`.
   - `getHistoricalWeeklyScores(seasonId)` - trailing-2-season `matchups.points` where
     `status = 'complete'`, feeds `chooseCeilingThreshold`.
   - `getSeasonHighScore(seasonId)` - max `matchups.points` this season for the Ceiling
     Watch snark line (must cite a TRUE fact per issue).
   - `getWeekActuals(seasonId, week)` - returns `{ complete, totalPoints, maxPoints,
     marginByMatchup: Map<matchupId, number> }` read from `matchups`, feeds grading.
   - `getBookProps(seasonId, week)` - read-side, formats DB rows into a `BookPropView[]`
     shape for the page (label "Prop 01 · League Total" etc, formatted line, over/under
     labels, snark, result-or-null).
   - `getBookPropById(propId)`, `getMemberPropPicksForWeek(memberId, seasonId, week)`.

2. **Sync layer** - new file `lib/sync/book-props.ts` (planned, not created):
   - `generateOrRepriceBookProps(seasonId, seasonYear, week)`: mirrors
     `lib/sync/book-lines.ts`'s `repriceBookLines` shape. Reads matchup pairings +
     `getWeekProjectedTotals` (already exported from `lib/queries/book.ts`) +
     `getRosterToFranchiseMap` (from `lib/queries/franchise-mapping.ts`). Skip entirely
     (return `{rowCount:0, locked:true}`) if `isWeekLocked` - props lock at the WEEK's
     first kickoff, not per-game like book_lines. Builds all 3 `NewBookProp` rows and
     upserts in ONE statement via `.onConflictDoUpdate({ target: [seasonId, week, kind,
     subjectType, subjectId], set: {...} })` against the existing
     `uq_book_props_season_week_kind_subject` unique constraint (NULLS NOT DISTINCT -
     Postgres ON CONFLICT matches on the column list regardless of that flag, should
     just work like `repriceBookLines` does for `book_lines`).
     - League Total: `subjectType: "league"`, `subjectId: null`.
     - Ceiling Watch: `subjectType: "league"`, `subjectId: null`.
     - Mercy Line: `subjectType: "matchup"`, `subjectId: String(matchupId)` - **this is a
       deliberate extension** beyond the schema comment's documented `'franchise' |
       'player' | 'league'` subjectTypes (that comment is descriptive, not an enum/CHECK
       constraint - column is plain `text`). Needed because grading must find the exact
       matchup regardless of roster/franchise reassignment; storing the franchise id
       alone would not let grading locate the OTHER side's actual score. Document this
       choice with a code comment when writing the sync file.
   - `gradeBookProps(seasonId)`: finds all DISTINCT weeks in `book_props` for this season
     with `result IS NULL` (avoids needing to guess "current week - 1" timing against
     Sleeper's own Tuesday week-bump), calls a per-week `gradeWeekProps` helper for each,
     which checks `getWeekActuals(...).complete` first (bails cheaply if not), then grades
     each ungraded prop row by kind and writes `result`/`actualValue`/`gradedAt` via
     `runAtomic` (`lib/db/atomic.ts`) as ONE batch of per-row `update` statements (not a
     loop of separate awaited statements) - all-or-nothing per grading pass, matching the
     "atomic per data type" rule. Skip (count in `skipped`) a `mercy_line` row whose
     `subjectId` matchup isn't found in `marginByMatchup` (2-sided data missing) rather
     than throwing.

3. **Wire into sync jobs**:
   - `lib/sync/hourly.ts`: add a `syncBookProps` step function (copy `syncBookLines`'s
     shape exactly, ~line 990-1038) calling `generateOrRepriceBookProps`, logging
     `sync_log` under `dataType: "book_props"`. Call it right after the existing
     `syncBookLines` call in `runHourlySync` (~line 1327-1343), in its own try/catch so a
     props failure never takes book_lines or the rest of the run down.
   - `lib/sync/daily.ts`: add a `syncBookPropGrading` step (no Sleeper API call needed -
     just `select id from seasons order by seasonYear desc limit 1`, matching
     `resolveBookWeek`'s "latest season" convention in `lib/queries/book.ts`), calling
     `gradeBookProps(seasonId)`, logging `sync_log` under `dataType: "book_props"`. Add it
     to the `Promise.allSettled([...])` array in `runDailySync` (~line 1348) alongside the
     other independent steps. Needs `desc` added to the `drizzle-orm` import at the top of
     `daily.ts` (currently only imports `and, eq, lt, ne, sql`).
   - Both routes (`app/api/sync-hourly/route.ts`, `app/api/sync-daily/route.ts`) already
     call `revalidateSite(...)` generically on any non-fully-failed run, so no route
     changes needed for cache invalidation.

4. **Shared types/copy** - extend `lib/book/shared.ts`:
   - `export type { PropKind, PropSide, PropResult } from "@/lib/book/props";` (same
     re-export pattern as `CoverResult` from `pricing.ts`).
   - `BookPropView` interface (id, kind, label "Prop 0N · ...", question, lineDisplay,
     overLabel/underLabel, overOdds/underOdds, snark, result: PropResult | null, locked).
   - `MemberPropPick` interface (propId, side, oddsAtPick, lockedAt).
   - Add `PROP_COPY` (or extend `BOOK_COPY`) with the League Total generic snark line
     (non-factual joke, fine to be static: design mock uses "Vegas would call this a
     lottery. We call it Sunday.") and the House Rules text (**already exists** as
     `BOOK_COPY.houseRules` - reuse it verbatim, don't duplicate).
   - Add `BOOK_ERRORS.noProp` ("There is no such prop.") for the new server action's
     rejection ladder.
   - A `propPickRejectionReason` pure guard function analogous to `pickRejectionReason`,
     unit tested alongside the existing ones in `shared.test.ts`. Simpler than the game
     version: no "slip lock" concept for props (issue doesn't mention a lock-in-picks CTA
     for props), so it's just: week mismatch -> locked; prop doesn't exist -> noProp; week
     locked (past first kickoff) OR existing pick already locked -> locked.

5. **Server action** - extend `app/actions/book.ts` with `togglePropPick({week, propId,
   side})`, modeled closely on `togglePick`: validate input with zod, resolve session
   member, resolve `bookWeek` and reject on week mismatch, look up the prop row (must
   belong to this season+week), check `isWeekLocked`, toggle-delete-if-same-side /
   upsert-with-onConflictDoUpdate-scoped-by-`isNull(lockedAt)` otherwise (copy the
   `setWhere: isNull(bookPicks.lockedAt)` pattern exactly), `revalidatePath("/book")`.

6. **API route** - new `app/api/book/prop-picks/route.ts`, near-identical copy of
   `app/api/book/picks/route.ts` (force-dynamic, session-gated, empty-on-signed-out,
   returns `{ data: { picks, week }, syncedAt }`).

7. **Client island** - new `components/book/props-island.tsx` ("use client"), modeled on
   `components/book/board-island.tsx`'s architecture: `useSessionMember()`, fetch
   `/api/book/prop-picks` on mount, discard payload if `week` doesn't match (mirror
   `picksForBoardWeek`'s reasoning, can duplicate the check inline rather than
   generalizing the existing helper - simpler, and the existing one is typed specifically
   to `MemberBookPick`), optimistic toggle via `togglePropPick`, `router.refresh()` on
   success. Renders the full 2-col grid of 3 prop cards (kicker "Prop 0N · Name", question,
   gold mono line via `formatPropLine`, two buttons with `propSideLabels`, odds via
   `formatMoneyline`, payout via `payoutLabel`/`pay` from `pricing.ts`, serif italic snark)
   PLUS the dashed House Rules card as the grid's 4th cell (per the design HTML,
   `docs/design_handoff_the_book/The Book.dc.html` lines ~391-419) - matches how
   `BoardIsland` owns its whole pane including the aside, not just the interactive bits.
   Grading display: prop.result === null -> "Pending" kicker/badge; otherwise show
   Over/Under (or Yes/No) with sage/rust + a checkmark/x glyph on the member's own pick,
   same visual language as `YourPickRow` in `board-island.tsx`.

8. **Wire into the page** - `app/book/page.tsx`: fetch `getBookProps(seasonId, week)`
   inside the existing try/catch (alongside `getBookBoard`), pass to a new `PropsIsland`
   in place of the current `ComingSoonPane` for the props tab. Keep `rethrowUnlessTolerable`
   discipline - an empty props fetch that silently caught would ISR-cache a dead tab.

9. **CLAUDE.md update required**: the client-island enumeration bullet under "Key
   Architecture Decisions" currently lists "...the book tab pill, and the book board
   island" with a rationale paragraph specific to the board island. Add "and the book
   props island" to that list and extend/generalize the rationale sentence to cover both
   (same reasoning: `/book` is ISR-cached HTML shared league-wide, so a member's own prop
   picks must resolve client-side). This file is checked into the repo and is treated as
   binding project convention - don't skip this edit, a reviewer will check it against the
   actual enumerated list.

10. **E2E test** - new `e2e/book-props.spec.ts`, modeled closely on
    `e2e/book-board.spec.ts`'s real-stack-no-mocks pattern (checks `book_props` table
    exists and has rows for the current priced week before running, `test.skip` otherwise,
    uses the `memberFixtureScope` helper, asserts against real Postgres rows after clicking
    the real over/under button, not just DOM state). Chromium-only per instructions
    (`npx playwright test e2e/book-props.spec.ts --project=chromium`), never the full suite.

11. **Quality gates** (none run yet): `npx tsc --noEmit`, `npm run test:unit`, the new E2E
    spec, screenshots of the Props tab desktop + mobile (via the `run` skill or a manual
    Playwright script against a running dev server - remember `.env.local`'s
    `POSTGRES_URL` is the LIVE DB, so don't run destructive migrations/tests against it
    carelessly; the E2E fixture pattern in `book-board.spec.ts` scopes its writes to
    `e2e-member-book%` sleeper_user_id and cleans up in `afterAll`).

12. **Commit in logical chunks** (pricing engine / query+sync layer / UI+action / tests),
    each with the `Co-Authored-By: Claude <noreply@anthropic.com>` trailer, per the ship
    pipeline's developer standing instructions
    (`~/.claude-personal/skills/ship/prompts/developer.md`).

13. **PR-DRAFT.md** at worktree root (NOT committed): summary, `Closes #224`, test
    evidence with real command output excerpts. Target is `prod` directly (the "stacks on
    #230" note is NO LONGER NEEDED - #230/the foundation is already merged into prod as
    `d3b5a62`). Do NOT open the PR.

## Gotchas / things to double check on resume

- **Rebase first.** This worktree's branch history (063ebca and its ancestors) predates
  the squash-merge of PR #230 into `prod`. Must `git fetch origin-https prod` and
  `git rebase --onto origin-https/prod 063ebca` before doing anything else, or before
  pushing whatever's already been committed. Content should be identical so this should
  be a clean/trivial rebase, but verify `git diff` between the old base and
  `origin-https/prod` is actually empty for the files this issue touches before trusting
  that.
- `gh issue view` returns empty in this repo/env - always use `gh api
  repos/wbwright1/HMLML/issues/<n>` instead.
- The schema's `book_props.subjectType` comment says `'franchise' | 'player' | 'league'`
  but it's a plain `text` column (no CHECK constraint) - using `'matchup'` for Mercy Line
  is safe but deserves an explicit code comment explaining the deviation (see point 2
  above) so a reviewer doesn't think it's a typo.
- `book_props` has NO `lockedAt` column (only `book_prop_picks` does) - the props
  themselves lock implicitly at the week's first kickoff (checked live against
  `nfl_games`), same as `book_lines`. Don't try to add a migration for this; it's
  intentional, matches the "locks at first kickoff" issue language.
- Props keep the SAME `id` across hourly repricing (upsert on the natural key, not
  delete+reinsert), so `book_prop_picks.propId` foreign keys stay valid across a member's
  whole week even as the line/odds move - this is the reason to upsert-in-place, not
  delete-and-recreate. Don't break this.
- Local dev DB access: `.env.local`'s `POSTGRES_URL` is the LIVE production DB per repo
  convention (see CLAUDE.md context) - `POSTGRES_DRIVER=pg` is needed locally to avoid the
  Neon HTTP 443 block, per prior project memory.
- `npm run test:unit` and the props.test.ts file have NOT been run yet - do this
  immediately on resume, before writing any more code, in case the pricing-engine math
  has more bugs like the two `toHalfInteger` rounding-bucket mistakes already caught.
