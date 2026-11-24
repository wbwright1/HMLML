"use client";

import { useRef, useState, useEffect, useCallback, type KeyboardEvent } from "react";

interface SeasonSelectorProps {
  seasons: number[];
  activeSeason: number | "all-time";
  onSelect: (year: number | "all-time") => void;
  showAllTime?: boolean;
}

export function SeasonSelector({
  seasons,
  activeSeason,
  onSelect,
  showAllTime = false,
}: SeasonSelectorProps) {
  const tablistRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = tablistRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = tablistRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

      e.preventDefault();

      const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]'
      );
      if (!tabs || tabs.length === 0) return;

      const currentIndex = Array.from(tabs).indexOf(
        e.currentTarget as HTMLButtonElement
      );
      let nextIndex: number;

      if (e.key === "ArrowRight") {
        nextIndex = currentIndex + 1 >= tabs.length ? 0 : currentIndex + 1;
      } else {
        nextIndex = currentIndex - 1 < 0 ? tabs.length - 1 : currentIndex - 1;
      }

      tabs[nextIndex].focus();
    },
    []
  );

  // Auto-scroll the active season tab into view
  useEffect(() => {
    const container = tablistRef.current;
    if (!container) return;
    const activeTab = container.querySelector<HTMLButtonElement>(
      '[aria-selected="true"]'
    );
    if (activeTab) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      activeTab.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "nearest", inline: "center" });
    }
  }, [activeSeason]);

  // "All-time" leads, followed by seasons in the order given (expected
  // newest-to-oldest) so the most-wanted chips are reachable without
  // horizontal scrolling on mobile.
  const items: { label: string; value: number | "all-time" }[] = showAllTime
    ? [
        { label: "All-time", value: "all-time" as const },
        ...seasons.map((year) => ({ label: String(year), value: year })),
      ]
    : seasons.map((year) => ({ label: String(year), value: year }));

  // Edge fade as a mask on the scroller itself (not an overlay), so the next
  // chip visibly peeks out and fades, signalling there is more to scroll.
  const maskImage =
    canScrollLeft && canScrollRight
      ? "linear-gradient(90deg, transparent, #000 10%, #000 85%, transparent)"
      : canScrollRight
        ? "linear-gradient(90deg, #000 85%, transparent)"
        : canScrollLeft
          ? "linear-gradient(90deg, transparent, #000 15%)"
          : undefined;

  return (
    <div className="relative">
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Select season"
        className="no-scrollbar flex flex-nowrap gap-2 overflow-x-auto scroll-smooth py-1 pr-8"
        style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
      >
      {items.map((item) => {
        const isActive = activeSeason === item.value;
        const isYear = item.value !== "all-time";
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(item.value)}
            onKeyDown={handleKeyDown}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-body-sm font-semibold transition-[scale,background-color,color] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
              isYear ? "font-mono tabular-nums" : ""
            } ${
              isActive
                ? "border-text-primary bg-text-primary text-canvas"
                : "border-border-strong text-text-secondary hover:text-text-primary hover:bg-surface-muted"
            }`}
          >
            {item.label}
          </button>
        );
      })}
      </div>
    </div>
  );
}
