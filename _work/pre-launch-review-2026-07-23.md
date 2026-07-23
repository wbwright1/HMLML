# Pre-Launch Product Review — 2026-07-23

Consolidated findings from a four-track review (live-site UX walkthrough, code/data correctness audit, launch readiness, engagement ideas) before sharing https://hmlml.app with the league.

Overall: site is launch-ready on security, error handling, and data architecture. Gaps are first-impression polish, two live data-correctness bugs, and season-transition fragility.

---

## Section 1 — Fix before sending the link (P0)

### 1.1 Footer "(outdated)" false alarm — IN PROGRESS
Every page footer shows "Last updated Nh ago (outdated)" in rust for ~9 of every 24 hours.
- Cause: `components/sync-timestamp.tsx:19-22` grants the 26h threshold only when `dataType === "daily"`, but daily sync logs types `"league"` and `"players"` (`lib/sync/daily.ts` uses `logSyncStart("daily", "league")` etc.). Footer defaults to `dataType="league"`, players page uses `"players"`; both wrongly judged against the 2h hourly threshold.
- Fix: branch threshold on cadence. Daily-cadence types (`league`, `players`, `drafts`, `playoffs`, `season_lookup`, `nfl_state`) → 26h; hourly types (`transactions`, `rosters`, `matchups`, `player_week_points`, `nfl_games`) → 2h.

### 1.2 No OG metadata / OG image / favicon / manifest — IN PROGRESS
Link drops in the group chat unfurl as a bare URL. `curl https://hmlml.app` shows zero `og:*`/`twitter:*` tags; `/favicon.ico`, `/apple-touch-icon.png`, `/manifest.webmanifest` all 404. No `public/` dir exists.
- Fix: `metadataBase` + `openGraph` + `twitter` in `app/layout.tsx`; static `app/opengraph-image.tsx` via `next/og` (1200x630 charcoal + gold brand card); `app/icon.svg`; `app/apple-icon.png` (180x180); `themeColor: "#1A1613"` in viewport export; `app/manifest.ts`.
- Follow-up (P1): per-page dynamic OG images for team pages (crest + all-time record) and matchup pages (score) via `opengraph-image.tsx` in those routes.

### 1.3 Offseason live-scores can corrupt completed 2025 matchups — IN PROGRESS
Live right now on Thursday evenings and weekends.
- Cause: `app/api/live-scores/route.ts:17-32` `isCurrentlyGameWindow()` keys purely off day-of-week + hour with no season awareness. `/matchups` mounts the poller unconditionally, so an offseason visit during a "window" triggers `refreshScoresIfStale` which upserts the latest 2025 week and can flip finished matchups back to `"in_progress"`.
- Fix: gate on NFL `season_type === "regular" | "post"` (from synced `nfl_state`), and only write to matchups in the current season/week.

### 1.4 Power Rankings all zeros in offseason — IN PROGRESS
`/records/power-rankings` renders `0 W - 0 L · 0% · 0.0 PF` for all 12 teams ("Ranked on the last 4 weeks" has no games in July). One tap from `/records`; reads as broken.
- Decision (Blake): build a dedicated preseason mode: rankings from franchise history weighted toward the most recent season, plus projected results for the upcoming year. Label clearly as preseason/offseason edition.

### 1.5 No robots.txt — indexing is accidental — IN PROGRESS
Site (including `/claim` and commish flows) is fully crawlable. Decision should be deliberate; default to `app/robots.ts` with `Disallow: /` for a private league.

---

## Section 1b — Found in post-merge verification (Blake, 2026-07-23) — IN PROGRESS

- **Slow navigation on mobile:** tapping nav tabs / opening the roster page takes a couple of seconds before anything visibly begins loading. Suspected: fully dynamic RSC pages with no `loading.tsx` boundaries (tap gives no feedback until the full server response), plus possible query waterfalls / per-request DB connection cost. Diagnosis + fix in flight (loading skeletons, Promise.all parallelization, connection reuse; no caching per Phase 1 decision).
- **Dead season-history year links:** Teams > [Team] > Season History years are not clickable / don't open that year's schedule. Fix in flight alongside the franchise-page Tier 1 work.

---

## Section 2 — Fix before the season starts (P1)

### Correctness
- **Mid-game false finals:** `lib/sync/hourly.ts:346-353` marks matchup `"complete"` once both sides have points > 0 (minutes after Sunday kickoff) and stamps a possibly wrong winner. Derive "final" from NFL game statuses (`nfl_games`) instead.
- **H2H streak label:** `lib/queries/records.ts:493-496` always says "N-game win streak" even when `currentStreakTeam` is the opponent (losing streak reads as a win streak).
- **Tie in weekly superlatives:** `lib/queries/superlatives.ts:97-98` — on a tie, winner and loser both resolve to `pair[0]`, producing "X beat X" with margin 0.
- **Rostered player not yet in `players` table vanishes:** `lib/queries/franchises.ts:178` and `lib/queries/players.ts:62` use `innerJoin(players)`; hourly roster sync can add a player before the daily players sync lands. Use `leftJoin` + fallback name/position (pattern already in `drafts.ts`).
- **Win% tie treatment inconsistent:** `records.ts:189,243,312` use `w/total` (ties = losses); `franchise-longevity.ts:94,205` use `(w + 0.5t)/total`. Standardize.
- **Ties stored as null-null dropped or mislabeled:** `lib/queries/divisions.ts:283-293` drops them from H2H/division records; `lib/queries/schedule.ts:159` can label incomplete null-null games "T". Derive tie from equal non-null points.
- **Week 0 leaks to banners:** `app/page.tsx:78,90` — Sleeper `week: 0` (common in off/pre) passes through `?? 0`. Clamp to >= 1.
- **Nondeterministic matchup pair order:** `lib/queries/matchups.ts:83` and `app/api/live-scores/route.ts:188-190` destructure `[a,b]` from arbitrary DB row order; >2 rows silently truncated. Order deterministically by rosterId.

### Season transition (offseason → draft → 2026)
- **`"drafting"` status falls through to Offseason hub:** `lib/hub/season-state.ts:26-31` only handles `in_season`/`pre_draft`/`complete`. Treat `drafting` as `"pre"`.
- **Preseason hub shows previous year:** `components/hub/preseason-hub.tsx:53,65,72` — with latest season `complete`, hub shows "2025 · Title Defense Loading" and 2025 rosters. When latest season is complete, derive upcoming year as `seasonYear + 1`.
- **`SLEEPER_LEAGUE_ID` static, no auto-advance:** `lib/sync/daily.ts:53-56` — new 2026 league id must be set manually or sync stays pinned to 2025. Either resolve newest league in chain at sync time, or document the manual runbook step.
- **New-league cold-start race:** `lib/sync/daily.ts:1050-1056` runs roster/draft/playoff syncs in parallel with `syncLeagueSettings`; first run after a new league id fails those steps (self-heals). Order `syncLeagueSettings` first.
- **Draft countdown env-only:** `components/hub/preseason-hub.tsx:72-73` reads `NEXT_PUBLIC_DRAFT_DATE`; silently absent if unset. Source from Sleeper `draft.start_time`, env as override.
- **Draft type heuristic:** `lib/sync/daily.ts:800-845` guesses snake/linear by `rounds > 10`; wrong for a snake rookie draft → wrong pick-provenance crests.

### UX / cosmetic
- **"Preseason" banner vs "In Season" badge contradiction:** `/history` and `/seasons` badge 2026 "In Season" from raw Sleeper `league.status` (`components/season-timeline-card.tsx:57`, `app/seasons/page.tsx:90`) while the global banner says PRESEASON. Derive from the same calendar logic.
- **Hub division records lack year label:** `components/hub/division-field-card.tsx:41` shows 2025 records ("10-4") with no year anywhere. Caption "2025 finish".
- **Empty 2026 tab on `/records`:** all 0-0 standings; hide until Week 1 or add empty state.
- **Raw Sleeper usernames as owners** (`r2ampage6`, `beauc43`) on `/teams` — consider friendly display names (Phase 3 member identity synergy).
- **`/playoffs` (no season) → 404**, though nothing links to it. Redirect to latest season.

### Ops
- **Hourly GitHub cron targets `hmlml-jade.vercel.app`** (`.github/workflows/cron.yml`), not `hmlml.app`. Point at canonical domain.
- **No cron-failure alerting:** add `if: failure()` notification step to the GitHub workflow; consider Vercel cron notifications for daily/generate-content.
- **`app/global-error.tsx` missing:** root-layout render errors fall back to Next's unstyled default page.
- **Both crons hinge on `getNFLState`:** a shape failure on `/state/nfl` aborts the entire hourly sync — the main single point of Zod-shape fragility.
- **Non-transactional delete-then-insert:** `lib/sync/hourly.ts:224-261` (roster_players) and `lib/sync/daily.ts:876-883` (draft_picks); mid-loop failure leaves partial wipe. Wrap in `db.transaction`. Also `hourly.ts:258-260` swallows insert errors silently.
- **No try/catch in some query modules:** `lib/queries/seasons.ts` (L11, L76, L94, L131), `lib/queries/divisions.ts` (L267, L339, L386), `lib/queries/members.ts:11` throw → 500 instead of degrading.
- **Scoring-settings fallback gap:** `lib/queries/seasons.ts:56-69` doesn't fall back when the row exists but `scoring_settings` is null.

---

## Section 3 — Engagement ideas (impact ÷ effort, best first)

### First-visit wow (launch window)
Theme: every one of the 12 members must find something about *themselves* within one tap.
1. **GOAT Ladder** (S/M): one page ranking all 12 franchises all-time with a snarky blurb each. Builds on `computePowerScore` + `getCareerStats`. Highest "check it the second you get the link" hook.
2. **Franchise "signature band"** (S/M): 3-4 emotional callouts above the fold on each team page (all-time record, rings, worst beatdown taken, primary rival). Presentation layer on `franchise-header.tsx`.
3. **"Who Owns Who" H2H grid** (S/M): lifetime record vs each of the other 11 on every franchise page, sorted, "your victim / your daddy" tags on extremes. `getHeadToHead` already returns the data.
4. **Per-team dynamic OG images** (M): crest + record unfurl when a team link is shared. `next/og`.
5. **Wall of Shame completeness pass** (S): verify all 12 franchises appear in at least one superlative.

### First month (offseason retention)
1. **Rookie Draft HQ** (M): countdown + draft-order reveal (worst team picks first = built-in roast) + last year's board. Timely: draft imminent.
2. **Weekly "Offseason Receipts / Move of the Week"** (M): auto-generated via existing `lib/content-gen` Site Desk engine + transactions sync. Predictable weekly cadence = best offseason retention. Mostly wiring.
3. **Trade Tracker verdicts** (M): Site Desk "who won this trade" layered on `/trades`.
4. **Offseason Power Rankings refresh** (S/M): periodic 1-12 re-drop with per-team blurbs. (Overlaps with fix 1.4.)
5. **Per-team Burning Questions previews** (M): expand `burning-questions-card.tsx` into per-franchise season previews.

### Season-time bets
1. **Coaching Malpractice tracker** (S/M): `lib/queries/lineup-efficiency.ts` already computes bench points; surface as weekly superlative + season leaderboard. Best value-for-effort in this bucket.
2. **Weekly recap "This Week's Damage"** (L): auto-drafted Tuesday newsletter from `week-standouts` + `superlatives` + `lineup-efficiency` via `content-gen`.
3. **Rivalry Week auto-detection** (M/L): badge matchups where `getRivalries` rivals meet; Site Desk hype preview.
4. **Live-game swing moments** (M/L): `win-probability.ts` + 30s poller → "Mercy Rule", "Dead Man Walking", "Improbable Comeback" on live cards.
5. **Playoff race tags** (M): "Win-and-in", "Controls own destiny", "Eliminated" on standings + playoffs hub.

**Multiplier:** Phase 3 member identity + smack (already on `feature/member-identity` branch) turns all of the above from Site Desk monologue into member-authored brawling. Don't gate anything on it.

---

## Verified healthy (no action)
- Sync endpoints 401 unauthenticated (`/api/sync-daily`, `/api/sync-hourly`, `/api/generate-content`).
- `/api/live-scores` degrades gracefully, 25s in-memory rate gate, exposes only public data.
- 404 page returns real 404, on-voice. `app/error.tsx` calm and on-brand.
- Franchise identity mapping across seasons correct everywhere checked (per-season `franchise_id` baked at sync; no cross-season roster_id collisions on read).
- Power-ranking math guards empty arrays / zero ranges; no division-by-zero found in records/superlatives.
- Every sync step logs start+complete to `sync_log`; atomic per data type; partial failures visible (`partial: true`).
- Hub HTML ~83KB, fonts self-hosted/preloaded, images via `remotePatterns`, HSTS set, Vercel Analytics wired, skip-to-content + aria labels present.
