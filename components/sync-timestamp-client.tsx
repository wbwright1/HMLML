"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

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
      aria-expanded={showAbsolute}
      className={`inline-flex min-h-11 flex-col justify-center rounded-[10px] px-1 text-caption text-left transition-[scale] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${isStale ? "text-accent-warm" : "text-text-tertiary"}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Clock className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
        Last updated {relativeTime}
        {isStale && " (outdated)"}
      </span>
      {showAbsolute && (
        <span className="block text-caption text-text-tertiary mt-0.5">
          {absoluteTime}
        </span>
      )}
    </button>
  );
}
