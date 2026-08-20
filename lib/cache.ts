import { unstable_cache } from "next/cache";

/**
 * Caching constants for the site's ISR strategy.
 *
 * League data only changes when a sync runs, so every public page is rendered
 * once and served from the ISR cache until either the time window lapses or a
 * successful sync calls revalidatePath("/", "layout"). The time window is only
 * a backstop for a sync that failed to revalidate.
 *
 * NOTE: Next.js requires a page's `export const revalidate` to be a statically
 * analyzable literal, so pages write `export const revalidate = 3600` directly
 * rather than importing this constant. Keep the two in sync; this module is the
 * documented source of truth and is used by the revalidation call sites.
 */
export const PAGE_REVALIDATE_SECONDS = 3600;

/** The root path + layout scope that a sync revalidates (every public page). */
export const SITE_REVALIDATE_PATH = "/";

/**
 * Tag carried by every unstable_cache entry holding league data.
 *
 * revalidatePath invalidates the full-route cache but NOT Data Cache entries
 * created by unstable_cache; those clear only on their own timer or via
 * revalidateTag. revalidateSite() calls both.
 */
export const LEAGUE_DATA_TAG = "league-data";

/**
 * Resolves to `never` at any position unstable_cache cannot round-trip through
 * JSON: Date (comes back a string), Map/Set (become {} and lose everything),
 * undefined and functions (dropped).
 *
 * This exists because the failure is silent. `lib/queries/trade-verdicts.ts`
 * returns a Map; wrapping it naively would have returned an empty Map and
 * dropped every trade verdict from /trades, with green types and a passing
 * build. Documenting the hazard is not enough when the next person adding a
 * cached query will not read the comment, so it is encoded here: an unsafe
 * return type fails to compile, naming the offending property, and the fix is
 * an explicit adapter at the boundary.
 */
type JsonSafe<T> =
  T extends Date | Map<unknown, unknown> | Set<unknown>
    ? never
    : T extends (...args: never[]) => unknown
      ? never
      : T extends readonly (infer U)[]
        ? readonly JsonSafe<U>[]
        : T extends object
          ? { [K in keyof T]: JsonSafe<T[K]> }
          : T;

/**
 * Wraps a query in the Data Cache under the shared league-data tag.
 *
 * Entries survive across requests, so the searchParams-driven pages (which
 * cannot be ISR-cached, since awaiting searchParams opts them out of static
 * rendering) stop hitting Postgres on every request. They are cleared by the
 * same revalidateSite() the sync jobs already call.
 *
 * `keyParts` should name the function; unstable_cache folds the call arguments
 * into the key on top of it, so per-argument entries come for free.
 */
export function cachedQuery<A extends readonly unknown[], R>(
  keyParts: string[],
  fn: (...args: A) => Promise<R & JsonSafe<R>>,
): (...args: A) => Promise<R> {
  return unstable_cache(fn, keyParts, {
    tags: [LEAGUE_DATA_TAG],
    revalidate: PAGE_REVALIDATE_SECONDS,
  });
}
