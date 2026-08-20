"use client";

import { useEffect, useState } from "react";
import { LivePill, type LivePillProps } from "@/components/live-pill";
import { isPlausibleGameWindow } from "@/lib/game-window";

const POLL_INTERVAL = 30_000;

interface LivePillIslandProps {
  /** Server-resolved seasonal/live state. Rendered as-is on first paint. */
  initial: LivePillProps;
  format?: "full" | "compact";
}

/**
 * Keeps the nav's live-games pill honest on an ISR-cached page.
 *
 * The seasonal state is resolved on the server and rendered immediately (no
 * layout shift, and it is all a crawler or a no-JS visitor ever needs). The
 * problem is only the LIVE variant: with pages cached for an hour, a baked-in
 * "6 GAMES LIVE" would keep showing a stale count, or keep showing LIVE long
 * after the games ended.
 *
 * So this refreshes from /api/live-scores, but only when it could possibly
 * matter: inside a plausible game window, or when the cached HTML already
 * claims LIVE (which is exactly the case that needs clearing). Outside those,
 * it never issues a request, so an ordinary offseason page view stays free.
 */
export function LivePillIsland({ initial, format }: LivePillIslandProps) {
  const [pill, setPill] = useState<LivePillProps>(initial);

  useEffect(() => {
    // Nothing to correct outside a game window unless the cached render is
    // asserting LIVE, in which case we must check whether that is still true.
    if (!isPlausibleGameWindow() && initial.state !== "live") return;

    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = async () => {
      try {
        const res = await fetch("/api/live-scores");
        if (!res.ok) return;
        const json = await res.json();
        const data = json?.data;
        if (!active || !data) return;

        const liveCount: number = data.liveCount ?? 0;

        if (liveCount > 0) {
          setPill({ ...initial, state: "live", liveCount, week: data.week });
          return;
        }

        // No live games: fall back to whatever the server resolved, and stop
        // polling once the window has closed.
        setPill(initial);
        if (data.isGameWindow === false && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch {
        // Leave the last known state in place; try again next tick.
      }
    };

    refresh();
    timer = setInterval(refresh, POLL_INTERVAL);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [initial]);

  return <LivePill {...pill} format={format} />;
}
