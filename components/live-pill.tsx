export type LivePillState = "live" | "preseason" | "week" | "playoffs" | "offseason";

export interface LivePillProps {
  state: LivePillState;
  /** state="live" only: number of games currently live. */
  liveCount?: number;
  /** state="live" only: current week, used by the "compact" format. */
  week?: number;
  /**
   * "full" -> "6 games live" (desktop topbar; "6 live" below xl).
   * "compact" -> "6 live · Wk 10" (mobile header); non-live "A · B" labels
   * keep only their key segment. Defaults to "full".
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
 * Header/topbar pill. Presentational; callers resolve live counts and
 * seasonal state (see lib/queries/nfl-state.ts) and pass the result in via
 * props. Absorbs the seasonal states previously rendered by the
 * now-removed seasonal pill badge component.
 */
/**
 * Splits a "A · B" label into segments and picks the one that must always
 * show. The rest hide below xl on the topbar (so the 1024-1279px header never
 * wraps) and are dropped entirely in the compact mobile format. Preseason
 * keeps its countdown ("WK 1 IN 34D"); between weeks keeps the week ("WK 10").
 */
function splitLabel(text: string, state: LivePillState) {
  const segments = text.split(" · ");
  const primaryIndex = state === "preseason" && segments.length > 1 ? 1 : 0;
  return { segments, primaryIndex };
}

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
      ? `${count} live${week != null ? ` · Wk ${week}` : ""}`
      : `${count} game${count === 1 ? "" : "s"} live`
    : (label ?? DEFAULT_LABELS[state]);

  const { segments, primaryIndex } = isLive
    ? { segments: [text], primaryIndex: 0 }
    : splitLabel(text, state);

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border-strong px-2.5 py-1 text-caption font-semibold text-text-secondary xl:px-3 ${className}`}
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
      {isLive ? (
        <span className="text-text-primary">
          {format === "full" ? (
            <>
              <span className="xl:hidden">{count} live</span>
              <span className="hidden xl:inline">{text}</span>
            </>
          ) : (
            text
          )}
        </span>
      ) : format === "compact" ? (
        <span>{segments[primaryIndex]}</span>
      ) : (
        <span>
          {segments.map((seg, i) =>
            i === primaryIndex ? (
              <span key={i}>
                {i > 0 && <span className="hidden xl:inline"> · </span>}
                {seg}
              </span>
            ) : (
              <span key={i} className="hidden xl:inline">
                {i > 0 && " · "}
                {seg}
              </span>
            )
          )}
        </span>
      )}
    </span>
  );
}
