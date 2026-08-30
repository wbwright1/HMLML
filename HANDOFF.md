# Handoff: issue #226, The Book 5/5 (Futures)

Branch `feat/226-book-futures`, cut from `origin-https/prod` @ `d3b5a62` (PR #230, full Book foundation).
Work stopped at user request during the design/implementation ramp. Almost nothing is written yet;
this file is the design of record so the next session does not have to re-read the foundation.

## Done

- Branch reset onto `d3b5a62` (verified: `git log -1` matches `origin-https/prod`).
- Read issue #226, epic #221 (+ Futures addendum), and the whole Book foundation:
  `lib/book/pricing.ts`, `lib/book/shared.ts`, `lib/queries/book.ts`, `lib/sync/book-lines.ts`,
  `app/actions/book.ts`, `app/api/book/picks/route.ts`, `components/book/{board-island,book-tabs}.tsx`,
  `app/book/page.tsx`, `e2e/book-board.spec.ts`, migration `0014_the_book.sql`, and the relevant
  `lib/db/schema.ts` tables.
- ONE code change committed: `lib/book/pricing.ts` now exports `MAX_IMPLIED_PROB` / `MIN_IMPLIED_PROB`
  (was module-private). Behaviour unchanged. Futures needs the same posted limits with a different
  overround.

## Key facts confirmed from the repo (do not re-derive)

- Next migration number is **0015** (`0014_the_book.sql` exists and is applied).
- `seasons` has `playoffWeekStart`, `status`, `championFranchiseId`, `toiletBowlFranchiseId`.
- `playoffBracketMatches`: `bracketType` 'winners'|'losers', `placement` (`p`; 1 = title game /
  Toilet Bowl final), `advancingRosterId` (Sleeper `w`, the LOWER scorer in losers matches).
- `playerWeekPoints`: `points`, `projectedPoints`, `started` (boolean), `slot`, `rosterId`, `week`.
- `players.yearsExp` exists and is synced (`lib/sync/daily.ts:580`). Nothing in the repo currently
  uses it for rookie detection. **It is a snapshot of the current NFL season**, so it is only valid
  for the in-progress season, which is the only season futures price. Fallback / union source:
  `draftPicks` where `draftType = 'rookie'` and `seasonId` = current season.
  NOTE: a live-DB read-only probe of `years_exp` population was BLOCKED by the permission
  classifier, so this is unverified against data. Verify before shipping, or ship the union.
- `franchiseSeasons` carries the `rosterId -> franchiseId` mapping plus `wins/losses/ties/pointsScored`.
- `rosterPlayers.slot` is 'starter' | 'bench' | 'ir' | 'taxi'.
- Sync-step pattern to copy: `syncBookLines` in `lib/sync/hourly.ts` (~line 990) plus
  `repriceBookLines` in `lib/sync/book-lines.ts` (single-statement `onConflictDoUpdate` with
  `excluded.*`). Daily-sync wiring point: `runDailySync` in `lib/sync/daily.ts:1334`.
- The design handoff `docs/design_handoff_the_book/` contains NO futures screens (grepped:
  zero hits for futures/champion/toilet). Futures UI must be built in the existing Book language.

## Plan of record (unwritten)

1. **`lib/db/schema.ts` + `lib/db/migrations/0015_book_futures.sql`** (FILE ONLY, never executed):
   - `book_futures`: id, season_id FK, market, subject_type, subject_id, prob real, odds int,
     priced_at, locked_at, graded_result, detail jsonb; unique (season_id, market, subject_id).
   - `book_future_picks`: id, member_id FK, season_id FK, market, subject_id, odds_at_pick,
     created_at/updated_at; unique (member_id, season_id, market).
2. **`lib/book/futures.ts`** (pure, no I/O) + `futures.test.ts`:
   - Constants: `WEEK_FUTURES_PLAYER_LOCK = 8`, `FUTURES_OVERROUND = 1.25`,
     `MIN_FUTURES_FAVORITE_ODDS = -400`, `FIELD_SUBJECT_ID = "field"`,
     `MVP_CANDIDATE_COUNT = 10`, `ROTY_CANDIDATE_COUNT = 8`.
   - `futuresOdds(prob)`: `toAmericanOdds(clamp(prob * FUTURES_OVERROUND, MIN/MAX_IMPLIED_PROB))`,
     then `Math.max(odds, -400)` on the favourite side. Longshots still cap at +1900.
     REQUIRES a small refactor of `pricing.ts`: extract `toAmericanOdds(impliedProb)` (clamping +
     round-to-5 + floors) and make `americanOdds(p) = toAmericanOdds(p * OVERROUND)`. Not done yet.
   - Team markets via a **seeded** Monte Carlo (`mulberry32`, deterministic => unit-testable):
     inputs `FuturesTeam[] { franchiseId, rosterId, wins, losses, ties, pointsFor, projectedPerWeek }`
     and `FuturesGame[] { rosterA, rosterB }` for the remaining schedule (one entry per real game, so
     the sim stays zero-sum; do NOT iterate per-team opponent lists, that double-counts games).
     Per sim: play remaining games with `computeWinProbability({scoreA:0,scoreB:0,projRemainingA,B})`,
     accumulate wins + a points proxy for the tiebreak, rank, take top `playoffSpots` as the bracket
     field, run `simulateBracketWinner`.
   - `simulateBracketWinner(field, projByRoster, rng, { invert })` with reseeding + byes:
     n teams, `target` = largest power of two <= n, `numGames = n - target`, the LAST `2*numGames`
     seeds play (highest vs lowest), the rest bye; winners re-sorted by seed each round.
   - **Toilet bowl = the same bracket over the NON-playoff teams ordered WORST FIRST, with
     `invert: true`, i.e. P(advance) = 1 - P(outscore).** Never reuse the winners helper unmirrored.
     Required unit test: a stronger projected team gets LONGER toilet-bowl odds.
   - Player markets: `softmaxProbabilities(scores, temperature)` over the WHOLE candidate pool
     (temperature ~30 points), then list the top N and aggregate the remainder into "The Field"
     (field prob = sum of the unlisted probs, which is why the softmax must cover the whole pool).
     Candidate score = banked started points + projectedPerWeek * remaining regular-season weeks,
     rest-of-season credited only to players currently in a `starter` slot.
   - Locks: `futuresLockWeek(market, playoffWeekStart)` => `playoffWeekStart` for champion/toilet,
     `WEEK_FUTURES_PLAYER_LOCK` for mvp/roty. Locked when that week has a non-`pre_game` row in
     `nfl_games` (game status, NEVER a points or clock heuristic).
   - Grading: `topScorer(rows)` with tie-breaks points desc -> per-started-week average desc ->
     fewer weeks started -> subjectId asc; `futureResult(row, winnerSubjectId, listedIds)` where
     the field row wins iff the winner is not a listed candidate.
3. **`lib/queries/book-futures.ts`**: reads for the futures board + member picks + pricing inputs.
4. **`lib/sync/book-futures.ts`**: `repriceFutures` (skip locked markets, single-statement upsert)
   and `gradeFutures` (champion from the winners-bracket `p=1` `advancingRosterId`; toilet bowl
   VERBATIM from `seasons.toiletBowlFranchiseId`; mvp/roty from started points, weeks 1..
   `playoffWeekStart - 1`). Wire into `runDailySync` with its own `sync_log` row
   (`dataType: "book_futures"`) and `revalidateSite()` already handled by the caller.
5. **Server action** `pickFuture` in `app/actions/book.ts` (session gate, lock re-check, odds
   snapshot, one row per market via `onConflictDoUpdate`, `setWhere: isNull(lockedAt)` pattern),
   plus `app/api/book/future-picks/route.ts` (`force-dynamic`, mirrors `/api/book/picks`).
6. **UI**: `components/book/futures-island.tsx` client island (session via `use-session-member`,
   picks via the new API route, `picksForBoardWeek`-style guard on the season id), four boards,
   dashed house-rules footnote per board, serif snark on the toilet-bowl card. Grow `book-tabs.tsx`
   to four tabs and add the pane in `app/book/page.tsx`. Update the CLAUDE.md island list.
7. **`e2e/book-futures.spec.ts`**: same runtime skip-guard shape as `e2e/book-board.spec.ts`
   (`to_regclass('public.book_futures')`), skip (never fake) when the tables/rows are absent.

## Gotchas

- **Never execute DDL or any write against the live DB.** `.env.local` `POSTGRES_URL` IS production.
  Migration 0015 is a FILE ONLY; the orchestrator applies it with the user's approval. A live-DB
  probe attempt was already blocked by the permission classifier, which is the correct behaviour.
- E2E therefore cannot exercise the new tables; it must skip. Prove the logic in unit tests.
- Never run the full Playwright suite (Neon quota). Single specs, chromium only.
- `unstable_cache` / `cachedQuery` cannot carry `Map`/`Date` (`JsonSafe`). `/book` is ISR
  (`revalidate = 3600`), so the futures pane must stay a server tree + client island for the slip.
- No em-dashes in any copy. Every numeral mono. Sage/rust always with a text label or glyph.

## Next step

Write the `toAmericanOdds` extraction in `lib/book/pricing.ts`, then `lib/db/schema.ts` +
`0015_book_futures.sql`, then `lib/book/futures.ts` with its tests. Nothing else is started.
