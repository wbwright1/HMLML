"use client";

import { useEffect, useState } from "react";
import { LiveIndicator } from "@/components/live-indicator";
import { isPlausibleGameWindow } from "@/lib/game-window";

const POLL_INTERVAL = 30_000;

type MatchupStatus = "in_progress" | "complete" | "scheduled";

interface MatchupLiveScoreProps {
  seasonYear: number;
  week: number;
  matchupId: number;
  /** Server-rendered values at cache-fill time. Rendered on first paint. */
  initialHomePoints: number;
  initialAwayPoints: number;
  initialStatus: MatchupStatus;
  /** Recorded winner flags, authoritative once the matchup is complete. */
  homeIsWinner: boolean;
  awayIsWinner: boolean;
}

/**
 * Keeps the matchup detail hero's score honest while a game is in progress.
 *
 * The page is ISR-cached for an hour, and it is reached by tapping a live game
 * on the hub, so without this the scores would sit frozen at cache-fill time
 * under LIVE chrome and a refresh would not help. Making the page dynamic is
 * not an option: crawlers walk hundreds of matchup URLs, which is the cost
 * problem this whole change exists to fix.
 *
 * So the page stays cached and only this score block refreshes, and only when
 * it could matter: the cached render says in progress, or the client clock is
 * inside a plausible game window. Historical matchups never poll.
 *
 * /api/live-scores only covers the current week of the latest season, so
 * updates are adopted only when the payload's season and week match this page.
 */
export function MatchupLiveScore({
  seasonYear,
  week,
  matchupId,
  initialHomePoints,
  initialAwayPoints,
  initialStatus,
  homeIsWinner,
  awayIsWinner,
}: MatchupLiveScoreProps) {
  const [home, setHome] = useState(initialHomePoints);
  const [away, setAway] = useState(initialAwayPoints);
  const [status, setStatus] = useState<MatchupStatus>(initialStatus);

  useEffect(() => {
    if (initialStatus !== "in_progress" && !isPlausibleGameWindow()) return;

    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const refresh = async () => {
      try {
        const res = await fetch("/api/live-scores");
        if (!res.ok) return;
        const json = await res.json();
        const data = json?.data;
        if (!active || !data) return;

        // Wrong season/week: this page is historical, nothing to poll for.
        if (data.seasonYear !== seasonYear || data.week !== week) {
          stop();
          return;
        }

        const mine = (data.scores ?? []).find(
          (s: { matchupId: number }) => s.matchupId === matchupId
        );
        if (!mine) return;

        setHome(mine.homeScore ?? 0);
        setAway(mine.awayScore ?? 0);
        setStatus(mine.status ?? "scheduled");

        if (mine.status === "complete") stop();
      } catch {
        // Freeze at the last known values and retry on the next tick.
      }
    };

    refresh();
    timer = setInterval(refresh, POLL_INTERVAL);

    return () => {
      active = false;
      stop();
    };
  }, [seasonYear, week, matchupId, initialStatus]);

  const isComplete = status === "complete";
  const isLive = status === "in_progress";
  const isUpcoming = !isComplete && !isLive;

  // Winner emphasis: the recorded flag is authoritative once final, otherwise
  // the current leader carries the emphasis.
  const homeWins = isComplete ? homeIsWinner : !isUpcoming && home >= away;
  const awayWins = isComplete ? awayIsWinner : !isUpcoming && away > home;

  return (
    <>
      <p className="text-stat text-4xl md:text-5xl whitespace-nowrap">
        <span
          className={
            isUpcoming
              ? "text-text-muted"
              : homeWins
                ? "text-text-primary"
                : "text-text-tertiary"
          }
        >
          {isUpcoming ? "--" : home.toFixed(1)}
        </span>
        <span className="text-text-muted mx-2">&middot;</span>
        <span
          className={
            isUpcoming
              ? "text-text-muted"
              : awayWins
                ? "text-text-primary"
                : "text-text-tertiary"
          }
        >
          {isUpcoming ? "--" : away.toFixed(1)}
        </span>
      </p>
      {isLive ? (
        <LiveIndicator />
      ) : (
        <span className="text-kicker">{isComplete ? "Final" : "Upcoming"}</span>
      )}
    </>
  );
}
