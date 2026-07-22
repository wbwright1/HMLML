"use client";

import { useState, useEffect } from "react";

interface KickoffCountdownProps {
  /** ISO datetime of the next kickoff (between-weeks target). */
  target: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
}

function getTimeRemaining(targetDate: Date): TimeRemaining | null {
  const diff = targetDate.getTime() - Date.now();
  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);

  return { days, hours, minutes };
}

/**
 * Three-card DAYS / HRS / MIN countdown to the next kickoff. Client island in
 * the same family as DraftCountdown (lazy useState seed + 1s setInterval tick).
 * Renders nothing at or past T-0; the parent hub swaps to its live state then.
 */
export function KickoffCountdown({ target }: KickoffCountdownProps) {
  const targetDate = new Date(target);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(() =>
    getTimeRemaining(targetDate)
  );

  useEffect(() => {
    if (timeRemaining === null) return;

    const interval = setInterval(() => {
      const remaining = getTimeRemaining(targetDate);
      setTimeRemaining(remaining);
      if (remaining === null) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate.getTime()]);

  if (timeRemaining === null) return null;

  const segments = [
    { value: String(timeRemaining.days), label: "Days" },
    { value: String(timeRemaining.hours).padStart(2, "0"), label: "Hrs" },
    { value: String(timeRemaining.minutes).padStart(2, "0"), label: "Min" },
  ];

  return (
    <div className="flex gap-3">
      {segments.map((seg) => (
        <div
          key={seg.label}
          className="card-surface flex min-w-[5rem] flex-col items-center px-5 py-4"
        >
          <span className="text-stat text-4xl leading-none text-text-primary tabular-nums">
            {seg.value}
          </span>
          <span className="text-kicker mt-2">{seg.label}</span>
        </div>
      ))}
    </div>
  );
}
