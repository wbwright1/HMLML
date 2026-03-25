"use client";

import { useRef, useEffect, useCallback, type KeyboardEvent } from "react";

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
      activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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
      {/* Fade indicators for horizontal scroll */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent z-10" />
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
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
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
