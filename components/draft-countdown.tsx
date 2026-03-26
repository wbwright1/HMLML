"use client";

import { useState, useEffect } from "react";

interface DraftCountdownProps {
  draftDate: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeRemaining(targetDate: Date): TimeRemaining | null {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();

  if (diff <= 0) return null;

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds };
}

export function DraftCountdown({ draftDate }: DraftCountdownProps) {
  const targetDate = new Date(draftDate);
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(
    () => getTimeRemaining(targetDate)
  );
  const [isPast, setIsPast] = useState(() => targetDate.getTime() <= Date.now());

  useEffect(() => {
    if (isPast) return;

    const interval = setInterval(() => {
      const remaining = getTimeRemaining(targetDate);
      if (remaining === null) {
        setIsPast(true);
        setTimeRemaining(null);
        clearInterval(interval);
      } else {
        setTimeRemaining(remaining);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPast, targetDate.getTime()]);

  // Hide entirely after draft date has passed (give 24h grace for "Draft Day!" message)
  const dayAfterDraft = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
  if (new Date() > dayAfterDraft) {
    return null;
  }

  // Draft day message
  if (isPast || timeRemaining === null) {
    return (
      <div className="rounded-lg border border-accent-green bg-accent-green-light p-6 text-center">
        <p className="text-caption uppercase text-accent-green mb-2">
          ROOKIE DRAFT
        </p>
        <p className="text-h1 text-accent-green">Draft Day!</p>
      </div>
    );
  }

  const segments = [
    { value: timeRemaining.days, label: "DAYS" },
    { value: timeRemaining.hours, label: "HRS" },
    { value: timeRemaining.minutes, label: "MIN" },
    { value: timeRemaining.seconds, label: "SEC" },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface p-6 text-center">
      <p className="text-caption uppercase text-accent-green mb-4">
        ROOKIE DRAFT COUNTDOWN
      </p>
      <div className="flex items-center justify-center gap-3 sm:gap-6">
        {segments.map((seg, i) => (
          <div key={seg.label} className="flex items-center gap-3 sm:gap-6">
            <div className="flex flex-col items-center">
              <span className="text-display tabular-nums text-text-primary">
                {String(seg.value).padStart(2, "0")}
              </span>
              <span className="text-caption uppercase text-text-tertiary mt-1">
                {seg.label}
              </span>
            </div>
            {i < segments.length - 1 && (
              <span
                className="text-h2 text-text-muted -mt-4"
                aria-hidden="true"
              >
                :
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
