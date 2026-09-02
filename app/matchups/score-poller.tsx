"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { LiveIndicator } from "@/components/live-indicator";
import { TeamLink } from "@/components/team-link";

interface LiveScore {
  matchupId: number;
  homeTeamId: string;
  homeTeamName: string;
  homeTeamSlug?: string | null;
  homeScore: number;
  awayTeamId: string;
  awayTeamName: string;
  awayTeamSlug?: string | null;
  awayScore: number;
}

interface ScorePollerProps {
  initialIsGameWindow?: boolean;
}

const POLL_INTERVAL = 30_000; // 30 seconds
const MAX_DURATION = 4 * 60 * 60 * 1000; // 4 hours

export function ScorePoller({
  initialIsGameWindow = false,
}: ScorePollerProps) {
  const [scores, setScores] = useState<LiveScore[]>([]);
  const [isGameWindow, setIsGameWindow] = useState(initialIsGameWindow);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const fetchScores = useCallback(async () => {
    try {
      const res = await fetch("/api/live-scores");
      if (!res.ok) return;

      const json = await res.json();
      setScores(json.data?.scores ?? []);
      setIsGameWindow(json.data?.isGameWindow ?? false);
    } catch {
      // Silently fail — will retry on next poll
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
      // Auto-stop after 4 hours
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

  // Auto-start when isGameWindow becomes true
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

  // Initial fetch on mount
  useEffect(() => {
    fetchScores();
  }, [fetchScores]);

  if (!isGameWindow || scores.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" aria-atomic="true" className="space-y-3">
      <div className="flex items-center gap-2">
        <LiveIndicator />
        <span className="text-sm text-text-tertiary">Live Scores</span>
      </div>
      <div className="grid gap-2">
        {scores.map((score) => (
          <div
            key={score.matchupId}
            className="flex items-center justify-between rounded-lg border border-accent-green/20 bg-accent-green-light px-4 py-3"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <TeamLink
                slug={score.homeTeamSlug}
                className="text-sm font-semibold truncate"
              >
                {score.homeTeamName}
              </TeamLink>
              <span className="text-sm font-bold tabular-nums">
                {score.homeScore.toFixed(1)}
              </span>
            </div>
            <span className="text-xs text-text-tertiary px-2">vs</span>
            <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
              <span className="text-sm font-bold tabular-nums">
                {score.awayScore.toFixed(1)}
              </span>
              <TeamLink
                slug={score.awayTeamSlug}
                className="text-sm font-semibold truncate text-right"
              >
                {score.awayTeamName}
              </TeamLink>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
