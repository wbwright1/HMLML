"use client";

import { useState, type ReactNode } from "react";

type TabKey = "board" | "futures" | "tracking" | "props";

const TABS: { key: TabKey; label: string }[] = [
  { key: "board", label: "The Board" },
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

  return (
    <div>
      <div
        role="tablist"
        aria-label="The Book sections"
        className="mb-6 inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-border bg-surface p-1"
      >
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`book-tab-${key}`}
            aria-selected={active === key}
            aria-controls={`book-pane-${key}`}
            onClick={() => setActive(key)}
            className={`cursor-pointer rounded-full px-4 py-1.5 text-body-sm font-medium transition-colors duration-150 ${
              active === key
                ? "bg-accent-gold-light text-accent-gold"
                : "text-text-tertiary hover:text-text-primary"
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
