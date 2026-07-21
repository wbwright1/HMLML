"use client";

/** @deprecated Not currently imported anywhere. Retained as the candidate base for Phase B per-player live polling. */

import { useEffect, useRef, useState, useCallback } from "react";
import { LiveMatchupCard } from "@/components/live-matchup-card";

interface PolledMatchup {
  matchupId: number;
  homeTeam: {
    name: string;
    slug: string;
    score: number;
    brandingColor?: string | null;
  };
  awayTeam: {
    name: string;
    slug: string;
    score: number;
    brandingColor?: string | null;
  };
  status: "live" | "final" | "upcoming";
  topScorer?: string;
}

interface ScorePollerProps {
  initialMatchups?: PolledMatchup[];
  week: number;
  seasonYear: number;
  initialIsGameWindow?: boolean;
}

const POLL_INTERVAL = 30_000; // 30 seconds
const MAX_DURATION = 4 * 60 * 60 * 1000; // 4 hours

export function ScorePoller({
  initialMatchups = [],
  week,
  seasonYear,
  initialIsGameWindow = false,
}: ScorePollerProps) {
  const [matchups, setMatchups] = useState<PolledMatchup[]>(initialMatchups);
  const [isGameWindow, setIsGameWindow] = useState(initialIsGameWindow);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch("/api/live-scores");
      if (!res.ok) return; // Freeze at last known values on error

      const json = await res.json();
      const data = json.data;

      if (data?.isGameWindow === false) {
        setIsGameWindow(false);
        return;
      }

      if (data?.scores && Array.isArray(data.scores)) {
        const updated: PolledMatchup[] = data.scores.map(
          (s: {
            matchupId: number;
            homeTeamName: string;
            homeTeamSlug?: string;
            homeScore: number;
            homeBrandingColor?: string | null;
            awayTeamName: string;
            awayTeamSlug?: string;
            awayScore: number;
            awayBrandingColor?: string | null;
            status?: string;
            topScorer?: string;
          }) => ({
            matchupId: s.matchupId,
            homeTeam: {
              name: s.homeTeamName,
              slug: s.homeTeamSlug ?? "",
              score: s.homeScore,
              brandingColor: s.homeBrandingColor ?? null,
            },
            awayTeam: {
              name: s.awayTeamName,
              slug: s.awayTeamSlug ?? "",
              score: s.awayScore,
              brandingColor: s.awayBrandingColor ?? null,
            },
            status:
              s.status === "complete"
                ? "final"
                : s.status === "in_progress"
                  ? "live"
                  : "upcoming",
            topScorer: s.topScorer,
          })
        );
        setMatchups(updated);

        // If all games ended, stop polling
        const allDone = updated.every((m) => m.status === "final");
        if (allDone) {
          setIsGameWindow(false);
        }
      }
    } catch {
      // On error: freeze at last known values, will retry next interval
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
    startTimeRef.current = null;
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return;

    startTimeRef.current = Date.now();
    setIsPolling(true);
    fetchScores();

    intervalRef.current = setInterval(() => {
      if (
        startTimeRef.current &&
        Date.now() - startTimeRef.current > MAX_DURATION
      ) {
        stopPolling();
        return;
      }
      fetchScores();
    }, POLL_INTERVAL);
  }, [fetchScores, stopPolling]);

  // Auto-start/stop based on game window
  useEffect(() => {
    if (isGameWindow && !isPolling) {
      startPolling();
    } else if (!isGameWindow && isPolling) {
      stopPolling();
    }
  }, [isGameWindow, isPolling, startPolling, stopPolling]);

  // Pause on tab hidden via Visibility API
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else if (isGameWindow) {
        startPolling();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
  }, [isGameWindow, startPolling, stopPolling]);

  if (matchups.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" aria-atomic="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {matchups.map((m) => (
          <LiveMatchupCard
            key={m.matchupId}
            matchupId={m.matchupId}
            homeTeam={m.homeTeam}
            awayTeam={m.awayTeam}
            status={m.status}
            week={week}
            seasonYear={seasonYear}
          />
        ))}
      </div>
    </div>
  );
}
