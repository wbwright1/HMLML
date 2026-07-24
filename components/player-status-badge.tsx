interface PlayerStatusBadgeProps {
  status: string | null;
  injuryStatus?: string | null;
  isRostered?: boolean;
}

export function PlayerStatusBadge({
  status,
  injuryStatus,
  isRostered = true,
}: PlayerStatusBadgeProps) {
  if (!isRostered) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-tertiary">
        Free Agent
      </span>
    );
  }

  if (injuryStatus === "IR" || status === "Injured Reserve") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-warm-light px-2 py-0.5 text-xs font-medium text-accent-warm">
        IR
      </span>
    );
  }

  if (injuryStatus === "Out") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-warm-light px-2 py-0.5 text-xs font-medium text-accent-warm">
        Out
      </span>
    );
  }

  if (injuryStatus === "Questionable" || injuryStatus === "Doubtful") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent-warm-light px-2 py-0.5 text-xs font-medium text-accent-warm">
        {injuryStatus}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-green-light px-2 py-0.5 text-xs font-medium text-accent-green">
      Active
    </span>
  );
}
