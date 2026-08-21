/**
 * True only inside `next build`'s prerender pass.
 *
 * Verified empirically rather than assumed: NEXT_PHASE is
 * "phase-production-build" in the build's render workers and undefined when
 * serving a request from `next start`, so this cleanly separates the two.
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Re-throws a data-fetch failure unless we are somewhere a missing database is
 * expected and tolerable: local dev, or the production build's prerender pass.
 *
 * Why this exists (#211): every page wraps its fetch in a swallow-all catch and
 * falls through to an empty state. That was harmless when every page was
 * force-dynamic, because a bad render affected exactly one request. Now that
 * pages are ISR-cached, a swallowed DB error becomes a *successful* empty
 * render that Next is entitled to cache, and the site then serves hollow HTML
 * until the next sync revalidates it.
 *
 * Letting the error throw means Next serves the error boundary and keeps the
 * last good cache entry instead of replacing it with an empty one. It is also
 * what makes the unstable_cache layer in #209 safe, since a thrown error is
 * never cached but an empty result would be.
 *
 * The build-phase exemption is deliberate: builds stay tolerant of a DB outage
 * so a data problem can never block a deploy (see CLAUDE.md). The post-deploy
 * revalidation hook covers the HTML that pass may have produced.
 */
export function rethrowUnlessTolerable(e: unknown): void {
  if (isBuildPhase() || process.env.NODE_ENV === "development") return;
  throw e;
}
