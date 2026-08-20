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
