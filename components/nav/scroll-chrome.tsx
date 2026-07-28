"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Always visible within this many px of the top; absorbs iOS rubber-band
 *  overscroll bounce so the chrome never flickers hidden at scrollY ~0. */
const REVEAL_ZONE = 8;
/** Chrome only starts hiding once the page has scrolled past this point. */
const HIDE_AFTER = 80;
/** Minimum scroll delta (px) before flipping direction; hysteresis, avoids
 *  jitter from sub-pixel / momentum scroll noise. */
const DELTA = 6;

interface ScrollChromeProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Client island: hides mobile nav chrome (header/dock) on scroll-down, reveals
 * it on scroll-up. Toggles `data-hidden` on the wrapper DOM node directly via
 * a rAF-throttled passive scroll listener -- no React state, no re-render per
 * scroll tick. Actual show/hide animation is pure CSS (see app/globals.css
 * `[data-scroll-chrome]` rules), which also inherits the site's global
 * prefers-reduced-motion transition-duration override.
 */
export function ScrollChrome({ children, className = "" }: ScrollChromeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let lastY = window.scrollY;
    let hidden = false;
    let ticking = false;

    function apply(next: boolean) {
      if (next === hidden) return;
      hidden = next;
      el!.setAttribute("data-hidden", String(hidden));
    }

    function update() {
      ticking = false;
      const y = window.scrollY;
      const delta = y - lastY;

      if (y <= REVEAL_ZONE) {
        apply(false);
      } else if (y < HIDE_AFTER) {
        apply(false);
      } else if (delta > DELTA) {
        apply(true);
      } else if (delta < -DELTA) {
        apply(false);
      }

      lastY = y;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reset to visible whenever the route changes (new page starts scrolled to
  // top; don't carry a "hidden" chrome state across navigations).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.setAttribute("data-hidden", "false");
  }, [pathname]);

  return (
    <div
      ref={ref}
      data-scroll-chrome=""
      data-hidden="false"
      className={className}
    >
      {children}
    </div>
  );
}
