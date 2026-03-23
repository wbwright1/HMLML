"use client";

import { useState } from "react";

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block size-3"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function SyncTimestampClient({
  relativeTime,
  absoluteTime,
  isStale,
}: {
  relativeTime: string;
  absoluteTime: string;
  isStale: boolean;
}) {
  const [showAbsolute, setShowAbsolute] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setShowAbsolute((prev) => !prev)}
      className={`text-caption text-left ${isStale ? "text-muted-foreground" : "text-foreground"}`}
    >
      <span>
        <ClockIcon /> Last updated {relativeTime}
      </span>
      {showAbsolute && (
        <span className="block text-[10px] text-muted-foreground mt-0.5">
          {absoluteTime}
        </span>
      )}
    </button>
  );
}
