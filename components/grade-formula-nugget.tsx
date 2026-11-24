"use client";

import { useId, useState } from "react";
import { ChevronDown, Info } from "lucide-react";

const FORMULA_LENSES = [
  {
    weight: "45%",
    label: "Points scored",
    descriptor:
      "What the players you got actually scored for you. Traded picks count once they are used.",
  },
  {
    weight: "35%",
    label: "Market value",
    descriptor: "What those assets are worth today, per FantasyCalc.",
  },
  {
    weight: "20%",
    label: "Wins changed",
    descriptor:
      "Games that would have been losses without the trade. Playoff games count double.",
  },
] as const;

/**
 * "How grades work": the trade-grade formula as a disclosure, closed by
 * default so /trades opens on the trades themselves. A button with
 * aria-expanded/aria-controls, not <details>: with a native <details> in the
 * tree, a same-route soft navigation on /trades (changing the season select)
 * never committed in the production build (found 2026-11-24, root cause in
 * React/Next not pinned down), so this stays a tiny client island.
 */
export function GradeFormulaNugget() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="card-surface px-4" data-testid="grade-formula" data-open={open ? "true" : "false"}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-[14px] text-left text-body font-semibold text-text-primary transition-[scale] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <Info
          className="size-5 shrink-0 text-accent-gold"
          strokeWidth={2}
          aria-hidden
        />
        <span className="flex-1">How grades work</span>
        <ChevronDown
          className={`size-4 shrink-0 text-text-tertiary transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      <div id={panelId} hidden={!open} className="space-y-4 border-t border-divider pb-4 pt-3">
        <ul className="space-y-3">
          {FORMULA_LENSES.map((lens) => (
            <li key={lens.label} className="flex items-start gap-3">
              <span className="w-12 shrink-0 font-mono text-body font-bold tabular-nums text-text-primary">
                {lens.weight}
              </span>
              <div className="min-w-0">
                <p className="text-body-sm font-semibold text-text-primary">
                  {lens.label}
                </p>
                <p className="text-body-sm text-text-secondary">
                  {lens.descriptor}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <p className="text-caption text-text-tertiary">
          Grades appear after six games or one year. FAAB and cash are not
          counted.
        </p>
      </div>
    </div>
  );
}
