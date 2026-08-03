"use client";

import { useEffect } from "react";

/**
 * Trades page deep-link scroll-focus island. Rendered INSIDE the streamed
 * trades list segment so it only mounts once the target `#trade-{id}` node
 * is actually in the DOM (fixes the soft-nav/cold-load race where Next's
 * native hash-scroll fires against the loading skeleton and gives up).
 * Renders nothing; ships near-zero JS.
 */
export function TradeScrollFocus({ targetId }: { targetId: string | null }) {
  useEffect(() => {
    if (!targetId) return;
    const el = document.getElementById(`trade-${targetId}`);
    // Instant scroll (no smooth behavior): avoids fighting reduced-motion
    // and any animation the target card is mid-reveal on.
    el?.scrollIntoView({ block: "start" });
  }, [targetId]);

  return null;
}
