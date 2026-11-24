"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { SavedPick } from "@/components/book/use-book-slip";

const DISMISS_MS = 5000;

/**
 * "Pick saved: Foopus +37.5", with an Undo.
 *
 * Rendered by each island that books through useBookSlip, so it only ever
 * confirms a write the server already accepted (the hook sets `saved` after
 * togglePick resolves ok). Undo goes back through the same hook, which means
 * the same server action: the toast is never the authority either.
 *
 * The live region is always in the DOM and only its contents change, which is
 * what makes screen readers announce it reliably. No entrance animation at
 * all, so there is nothing for prefers-reduced-motion to neutralize; the timer
 * pauses while the pointer or focus is on the toast so Undo can't vanish
 * under a finger.
 */
export function PickToast({
  saved,
  onUndo,
  onDismiss,
}: {
  saved: SavedPick | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-(--z-toast) flex justify-center lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[384px]"
    >
      {saved && (
        // Keyed per save: a fresh save gets a fresh timer and a fresh pause flag.
        <ToastCard
          key={saved.id}
          saved={saved}
          onUndo={onUndo}
          onDismiss={onDismiss}
        />
      )}
    </div>
  );
}

function ToastCard({
  saved,
  onUndo,
  onDismiss,
}: {
  saved: SavedPick;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => dismissRef.current(), DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [paused]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex min-h-[52px] w-full max-w-sm items-center gap-2.5 rounded-[14px] border border-border-strong bg-popover py-1 pr-1.5 pl-3.5 shadow-(--shadow-float)"
    >
      <Check
        className="size-5 shrink-0 text-accent-green"
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 text-body-sm text-text-primary">
        Pick saved: {saved.teamName}{" "}
        <span className="font-mono font-semibold tabular-nums">{saved.line}</span>
      </span>
      <button
        type="button"
        onClick={onUndo}
        className={buttonVariants({ variant: "quiet", size: "default", className: "px-3" })}
      >
        Undo
      </button>
    </div>
  );
}
