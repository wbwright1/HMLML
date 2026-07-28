"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface SeasonSwitcherProps {
  playerId: string;
  seasonsPresent: number[];
  selectedSeason: number | null;
  variant: "modal" | "page";
  projectedActual: React.ReactNode;
  weeklyLines: React.ReactNode;
}

/**
 * Client island for the season picker on a player profile, plus the two
 * sections that redraw when the season changes (ProjectedActual and the
 * weekly-lines table), dimmed while a switch is in flight.
 *
 * Both variants get in-place switching, via two DIFFERENT mechanisms:
 *
 * - Page variant: `history.replaceState` (a shallow URL update, not a Next
 *   navigation) followed by `router.refresh()` inside a transition.
 *   Empirically (see PR discussion on issue #142), a client-side Next
 *   navigation (router.push/replace) to the canonical /players/[id] page's
 *   OWN pathname still triggers the `@modal` intercepted-route parallel
 *   slot and pops the modal open over the page — intercepting routes match
 *   on the navigation target, regardless of soft-vs-hard origin. A raw
 *   history update sidesteps Next's router entirely (no navigation event,
 *   so the interceptor never sees it), and `router.refresh()` just re-runs
 *   the current route's Server Components against the new request URL — not
 *   a navigation either, so it can't be intercepted.
 *
 *   Two more things had to be worked around empirically for this path:
 *
 *   1. `router.refresh()` resets `window.scrollY` to 0 once its re-render
 *      commits (confirmed via a scroll timeline probe: constant scrollY the
 *      whole pending window, then a hard drop to 0 the instant the new
 *      content lands — reproducible even dispatching the click
 *      synthetically, so it isn't a focus/scroll-into-view artifact). Since
 *      that's strictly worse than a hard `<a>` reload would have been, we
 *      capture scrollY on click and restore it once new data actually
 *      lands.
 *   2. `useTransition`'s `isPending` resolves as soon as router.refresh()
 *      is CALLED, well before the server round-trip that swaps in new
 *      content completes — so it can't gate re-clicks or drive "did the new
 *      season actually land" logic. Both the scroll restore and the
 *      re-click guard below are keyed off `selectedSeason` itself changing
 *      (the prop only changes once the server actually re-rendered).
 *
 *   For rapid successive clicks specifically: firing a second
 *   router.refresh() before the first one's RSC payload has landed lets the
 *   two responses race and resolve out of order (verified: clicking through
 *   several pills in immediate succession could settle on whichever request
 *   happened to resolve last, not whichever was clicked last). Fixed by
 *   serializing: while a request is in flight, a further click just updates
 *   `queuedYear` instead of firing a second router.refresh(); when the
 *   in-flight one lands, if a newer year was queued meanwhile, it's fired
 *   immediately. So only one request is ever in flight, and the last click
 *   always eventually wins.
 * - Modal variant: `router.replace` (a real Next navigation) inside a
 *   transition. router.replace, not push: a pushed history entry per
 *   season switch breaks the modal's single-router.back() close on
 *   Escape/backdrop/X (see the comment on handlePillClick). Next's router
 *   supersedes an in-flight navigation when a new one starts, so rapid
 *   clicks don't need the same manual queuing as the page variant.
 */
export function SeasonSwitcher({
  playerId,
  seasonsPresent,
  selectedSeason,
  variant,
  projectedActual,
  weeklyLines,
}: SeasonSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const savedScrollY = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const queuedYearRef = useRef<number | null>(null);
  const [pageSwitchPending, setPageSwitchPending] = useState(false);

  function fireRefresh(year: number) {
    inFlightRef.current = true;
    if (savedScrollY.current == null) savedScrollY.current = window.scrollY;
    window.history.replaceState(null, "", `/players/${playerId}?season=${year}`);
    setPageSwitchPending(true);
    startTransition(() => {
      router.refresh();
    });
  }

  // Fires once new data actually lands (selectedSeason prop changes) for
  // the page variant: restores scroll, then either fires the next queued
  // request (rapid clicks) or clears the pending flag.
  useEffect(() => {
    if (variant !== "page") return;
    inFlightRef.current = false;

    if (savedScrollY.current != null) {
      const y = savedScrollY.current;
      savedScrollY.current = null;
      // rAF: let the browser finish its own post-commit scroll adjustment
      // for this paint before we override it.
      requestAnimationFrame(() => {
        window.scrollTo(0, y);
      });
    }

    if (queuedYearRef.current != null && queuedYearRef.current !== selectedSeason) {
      const next = queuedYearRef.current;
      queuedYearRef.current = null;
      fireRefresh(next);
      return;
    }
    queuedYearRef.current = null;
    setPageSwitchPending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason]);

  const dimmed = variant === "page" ? pageSwitchPending : isPending;

  function handlePillClick(
    e: React.MouseEvent<HTMLAnchorElement>,
    year: number,
    href: string
  ) {
    if (year === selectedSeason) {
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return; // modifier / non-left click: fall through to normal browser handling
    }
    e.preventDefault();
    if (variant === "page") {
      if (inFlightRef.current) {
        // A request is already in flight: queue this year instead of
        // firing a second, racing router.refresh(). Last click wins.
        queuedYearRef.current = year;
        return;
      }
      fireRefresh(year);
      return;
    }
    startTransition(() => {
      // router.replace, not push: the modal was opened with exactly ONE
      // history entry (the soft nav that triggered the interception), and
      // ProfileModalShell's close (Escape / backdrop / X) does a single
      // router.back(). Pushing a new entry per season switch would mean an
      // Escape after switching seasons only undoes the last switch instead
      // of closing the modal. Replace keeps the modal's history footprint
      // at one entry so close always works in a single step; season
      // history isn't individually restorable via browser Back, but the
      // modal reliably opens/closes/switches, which matters more.
      router.replace(href, { scroll: false });
    });
  }

  return (
    <>
      <div
        aria-busy={dimmed}
        className={`transition-opacity duration-150 ${dimmed ? "opacity-50" : "opacity-100"}`}
      >
        {projectedActual}
      </div>

      <div className="space-y-3">
        <p className="text-kicker text-text-tertiary">Weekly Lines</p>

        {seasonsPresent.length > 1 && (
          <nav
            aria-label="Season"
            aria-busy={dimmed}
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {seasonsPresent.map((year) => {
              const isActive = year === selectedSeason;
              const href = `/players/${playerId}?season=${year}`;
              return (
                <a
                  key={year}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  onClick={(e) => handlePillClick(e, year, href)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-body-sm font-medium tabular-nums transition-colors ${
                    isActive
                      ? "border-accent-gold/30 bg-accent-gold-light text-accent-gold"
                      : "border-border bg-surface text-text-tertiary hover:text-text-primary"
                  }`}
                >
                  {year}
                </a>
              );
            })}
          </nav>
        )}

        <div
          aria-busy={dimmed}
          className={`transition-opacity duration-150 ${dimmed ? "opacity-50" : "opacity-100"}`}
        >
          {weeklyLines}
        </div>
      </div>
    </>
  );
}
