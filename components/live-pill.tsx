export type LivePillState = "live" | "preseason" | "week" | "playoffs" | "offseason";

export interface LivePillProps {
  state: LivePillState;
  /** state="live" only: number of games currently live. */
  liveCount?: number;
  /** state="live" only: current week, used by the "compact" format. */
  week?: number;
  /**
   * state="live" only. "full" -> "6 GAMES LIVE" (desktop topbar).
   * "compact" -> "6 LIVE · WK 10" (mobile header). Defaults to "full".
   */
  format?: "full" | "compact";
  /** Non-live states only: override display text. Defaults to a label derived from `state`. */
  label?: string;
  /**
   * Non-live states only: render a static (non-pulsing) gold dot before the
   * label. Used for the preseason and between-weeks kickoff-countdown labels;
   * omitted (no dot) for the plain fallback labels.
   */
  staticDot?: boolean;
  className?: string;
}

const DEFAULT_LABELS: Record<Exclude<LivePillState, "live">, string> = {
  preseason: "Preseason",
  week: "Week",
  playoffs: "Playoffs",
  offseason: "Offseason",
};

/**
 * Header/topbar pill. Presentational — callers resolve live counts and
 * seasonal state (see lib/queries/nfl-state.ts) and pass the result in via
 * props. Absorbs the seasonal states previously rendered by the
 * now-removed seasonal pill badge component.
 */
export function LivePill({
  state,
  liveCount,
  week,
  format = "full",
  label,
  staticDot = false,
  className = "",
}: LivePillProps) {
  const isLive = state === "live";
  const count = liveCount ?? 0;

  const text = isLive
    ? format === "compact"
      ? `${count} LIVE${week != null ? ` · WK ${week}` : ""}`
      : `${count} Game${count === 1 ? "" : "s"} Live`
    : (label ?? DEFAULT_LABELS[state]);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-caption text-text-tertiary ${className}`}
    >
      {isLive && (
        <span className="relative flex size-1.5 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75 motion-safe:animate-[live-pulse_1.6s_ease-out_infinite]" />
          <span className="relative inline-flex size-1.5 rounded-full bg-accent-green" />
        </span>
      )}
      {!isLive && staticDot && (
        <span className="inline-flex size-1.5 shrink-0 rounded-full bg-accent-gold" aria-hidden="true" />
      )}
      <span className={isLive ? "text-text-primary" : undefined}>{text}</span>
    </span>
  );
}
