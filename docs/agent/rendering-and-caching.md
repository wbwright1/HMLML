# Rendering & Caching Reference

Read this before adding a page, a client component, a query used by a page, or anything that revalidates. The invariants are summarized in `CLAUDE.md`; this file holds the detail and the reasoning.

## Client islands

Pages and layouts stay React Server Components. `"use client"` is for small leaf islands only, and each one needs a reason from this list: interactivity (search, pickers, filters/sort, countdowns, the smack composer, the player-profile modal shell, scroll-chrome), live data inside cached HTML (the score poller, the matchup-detail live score, the nav live pill), or per-member session state inside cached HTML (the nav crest, the smack composer slot, the Book islands). `grep -rl '"use client"' app components` lists the current set.

Why session state is client-side: `/book` and `/` are ISR-cached HTML served to the whole league, so anything that belongs to the viewing member resolves in the browser. Session comes from one shared `/api/session` fetch via `components/use-session-member.ts`; picks come from `/api/book/picks`, `/api/book/prop-picks`, and `/api/book/future-picks`. Specifically: the member's own slip (board island), season-long tickets (futures island), "YOU" chip on every picker rail, Week Pulse stats and lock row, and not-yet-kicked-off picks (tracking island), live slip record (the hub rail card, `book-rail-island`), and prop picks (props island).

Book island rules:

- The board, tracking, futures and props islands' picks are all re-enforced by their own server actions; the client is never the authority. The rail island is read-only.
- The tracking island books the league pick'ems through the SAME `togglePick` action the board uses (a Board wager and a pick'ems pick are one `book_picks` row), so both islands fire and subscribe to `lib/book/pick-events.ts` to stay in sync.
- Streak Watch has no session dependency and stays a plain server component.

## Sync-driven ISR

Every public page declares `export const revalidate = 3600` and is served from the ISR cache. Each successful sync run (sync-daily, sync-hourly, generate-content) calls `revalidatePath("/", "layout")` via `lib/revalidate.ts`, so pages refresh when data lands rather than on a timer. League data only changes when a sync runs, so this is exactly as correct as querying per request and far cheaper (the previous `force-dynamic` everywhere exhausted Neon's transfer quota on crawler traffic). Time windows and the revalidate constant live in `lib/cache.ts`.

The one non-sync revalidation: when a live refresh in `/api/live-scores` changes scores, it calls `revalidateLiveSurfaces()` (only `/`, `/matchups`, and the matchup detail pages, page-scoped), throttled to once per `LIVE_REVALIDATE_MIN_MS`. That route resolves its week through `resolveCurrentWeek()` (`lib/queries/matchups.ts`), the same resolver as the hub, never `max(matchups.week)`: the full schedule is pre-synced, so the max is the last regular-season week.

Deliberately still dynamic (no `revalidate` export): `/claim` and `/commish` (authenticated), `/api/live-scores` (the poller), `/api/session`, `/api/book/picks`, `/api/book/prop-picks`, `/api/book/future-picks`, `app/test/error-trigger`, the intercepted player modal route, and the pages whose `searchParams` drive a server query (`/trades`, `/schedule`, `/teams/[slug]/schedule`, `/records/head-to-head`, `/drafts/[year]`, `/players/[id]`). Awaiting `searchParams` would make a `revalidate` export inert.

## Query-layer caching for dynamic pages

The queries behind those `searchParams` pages and `/api/search` are wrapped in `cachedQuery()` (`lib/cache.ts`), which is `unstable_cache` tagged `LEAGUE_DATA_TAG`. `revalidateSite()` clears both caches: `revalidatePath` for the route cache and `revalidateTag` for the Data Cache, because **`revalidatePath` does not touch `unstable_cache` entries**. Wrap by renaming the implementation to `…Uncached` and exporting the cached binding under the original name, so pages need no changes.

`unstable_cache` serializes through JSON: `Date` returns as a string, and `Map`/`Set` become `{}` and lose everything, all behind types that still claim otherwise. `cachedQuery`'s `JsonSafe<T>` constraint makes that a compile error (it caught a real `Map` in `getSeasonSchedule` that would have silently emptied `/schedule`, and one in `getTradeVerdicts`). When it fires, write an explicit adapter at the boundary (cache entries and rebuild the `Map`; drop unused `Date` columns) rather than casting past it. Anything genuinely live inside a cached page is a client island, not a reason to drop the cache.

## DB errors and builds

A DB error at request time must throw, never fall through to an empty state: ISR will cache a "successful" hollow render and serve it until the next sync. Every page's data-fetch catch calls `rethrowUnlessTolerable(e)` (`lib/db-guard.ts`), which re-throws everywhere except local dev and the `next build` prerender pass, so Next serves the error boundary and keeps the last good cache entry. Genuinely optional data (avatars, rivalry flags, lineups, live asides) keeps its empty-state catch: those are real non-error outcomes.

Builds stay tolerant of a DB outage on purpose. Failing `next build` when Postgres is down was considered and rejected: Vercel builds every push, so it would turn a data problem into "nobody can ship" and block the deploy that might carry the fix. The cost is that a build during an outage can prerender empty HTML, which `.github/workflows/post-deploy-revalidate.yml` covers by calling `/api/revalidate` as soon as a production deploy succeeds.

## Dynamic APIs in layouts

Never read `cookies()`/`headers()` in a layout or anything a layout renders: a dynamic API anywhere in the render tree opts the WHOLE route out of static generation, and from the root layout that silently defeats ISR on every page. Session-dependent chrome is a client island fed by `/api/session` (`components/nav/nav-crest-island.tsx`, `components/smack-composer-slot.tsx`). For the same reason, a page's effective revalidate window is capped by the shortest `next: { revalidate }` fetch inside its render, so keep page-path Sleeper fetches at the page window (see `lib/queries/nfl-state.ts`).

## Live Sleeper calls on page paths

No page load triggers a live Sleeper API call, with one deliberate exception: the players-page trending-adds rail calls Sleeper's trending endpoint through `lib/sleeper.ts` with a 1-hour fetch cache. (The between-weeks hub's old "Trending" module was a second exception; it is now the Postgres-only "League Moves" card, `lib/queries/league-moves.ts`.)
