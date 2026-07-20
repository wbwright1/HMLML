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

  const items: { label: string; value: number | "all-time" }[] = seasons.map(
    (year) => ({ label: String(year), value: year })
  );

  if (showAllTime) {
    items.push({ label: "All-Time", value: "all-time" });
  }

  return (
    <div className="relative">
      {/* Fade indicators for horizontal scroll — only visible when content overflows */}
      {canScrollLeft && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-canvas to-transparent z-10" />
      )}
      {canScrollRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-canvas to-transparent z-10" />
      )}
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Select season"
        className="flex flex-nowrap gap-1 overflow-x-auto scroll-smooth pb-2 scrollbar-thin px-6"
      >
      {items.map((item) => {
        const isActive = activeSeason === item.value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(item.value)}
            onKeyDown={handleKeyDown}
            className={`shrink-0 rounded-full px-4 py-1.5 text-body-sm font-medium font-mono tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              isActive
                ? "bg-accent-gold-light text-accent-gold font-bold"
                : "text-text-tertiary hover:text-text-primary hover:bg-surface-muted"
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
