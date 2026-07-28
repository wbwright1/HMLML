"use client";

import { AlertCircle } from "lucide-react";
import { ProfileModalShell } from "@/components/player-profile/profile-modal-shell";

/**
 * Calm, in-shell error per site voice (never panicked). The shell's own close
 * button / backdrop / Escape handling still works since this renders inside it.
 */
export default function InterceptedPlayerModalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ProfileModalShell>
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <AlertCircle
          className="size-10 text-text-tertiary/50"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <div className="space-y-1">
          <h1 id="player-profile-title" className="text-h3 text-text-primary">
            Something went wrong.
          </h1>
          <p className="text-body-sm text-text-tertiary max-w-sm">
            We&apos;re showing the last available data. Try again in a moment.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-border bg-surface px-4 py-2 text-body-sm font-medium text-text-primary hover:bg-surface-muted transition-colors"
        >
          Try again
        </button>
      </div>
    </ProfileModalShell>
  );
}
