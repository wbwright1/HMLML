"use client";

import { useTransition } from "react";
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
 * Soft (in-place) navigation is used ONLY in the modal variant. Empirically
 * (see PR discussion on issue #142), a client-side navigation to the SAME
 * pathname from the canonical /players/[id] page still triggers Next's
 * `@modal` intercepted-route parallel slot and pops the modal open over the
 * full page — intercepting routes match on the navigation target, not on
 * "did this navigation originate from a soft push." So the page variant
 * keeps a real hard `<a>` (full document navigation, unchanged behavior);
 * only the modal variant gets the router.replace + pending-dim treatment.
 *
 * router.replace, not push: see the comment on handlePillClick for why
 * (a pushed history entry per season switch breaks the modal's
 * single-router.back() close on Escape/backdrop/X).
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

  const dimmed = variant === "modal" && isPending;

  function handlePillClick(
    e: React.MouseEvent<HTMLAnchorElement>,
    year: number,
    href: string
  ) {
    if (variant !== "modal") return; // page variant: let the hard <a> navigate normally
    if (year === selectedSeason) {
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return; // modifier / non-left click: fall through to normal browser handling
    }
    e.preventDefault();
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
