"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

type TabKey = "board" | "futures" | "tracking" | "props";

const TABS: { key: TabKey; label: string }[] = [
  { key: "board", label: "Board" },
  { key: "futures", label: "Futures" },
  { key: "tracking", label: "Tracking" },
  { key: "props", label: "Props" },
];

/**
 * The Book's four-tab pill.
 *
 * The panes are server-rendered and passed in as children; this island only
 * flips which one is visible. Routing the tabs through a `?tab=` search param
 * would have been the obvious move and is exactly wrong here: awaiting
 * searchParams opts the page out of static rendering, and /book is meant to be
 * served from the ISR cache. Tab content is cheap, so all four ship in the
 * cached HTML and the toggle costs nothing.
 */
export function BookTabs({
  board,
  futures,
  tracking,
  props,
}: {
  board: ReactNode;
  futures: ReactNode;
  tracking: ReactNode;
  props: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("board");

  const panes: Record<TabKey, ReactNode> = { board, futures, tracking, props };

  // Standard tablist keys: arrows move (and select) along the one row, Home
  // and End jump to the ends. Only the selected tab sits in the tab order.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((t) => t.key === active);
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const key = TABS[next].key;
    setActive(key);
    document.getElementById(`book-tab-${key}`)?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="The Book sections"
        onKeyDown={onKeyDown}
        className="mb-6 grid w-full grid-cols-4 gap-0.5 rounded-full border border-border-strong bg-surface p-1 sm:max-w-[480px]"
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`book-tab-${key}`}
            aria-selected={active === key}
            aria-controls={`book-pane-${key}`}
            tabIndex={active === key ? 0 : -1}
            onClick={() => setActive(key)}
            className={`min-h-11 min-w-0 cursor-pointer whitespace-nowrap rounded-full px-1 text-body-sm font-semibold transition-[scale,background-color,color] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
              active === key
                ? "bg-text-primary text-canvas"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {TABS.map(({ key }) => (
        <div
          key={key}
          role="tabpanel"
          id={`book-pane-${key}`}
          aria-labelledby={`book-tab-${key}`}
          hidden={active !== key}
        >
          {panes[key]}
        </div>
      ))}
    </div>
  );
}
