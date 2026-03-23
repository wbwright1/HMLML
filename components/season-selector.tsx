"use client";

import { useRef, useCallback, type KeyboardEvent } from "react";

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

  const items: { label: string; value: number | "all-time" }[] = seasons.map(
    (year) => ({ label: String(year), value: year })
  );

  if (showAllTime) {
    items.push({ label: "All-Time", value: "all-time" });
  }

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label="Select season"
      className="flex flex-nowrap gap-1 overflow-x-auto pb-2 scrollbar-thin"
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
  );
}
