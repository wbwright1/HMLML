import type { ValueSeriesPoint } from "@/lib/queries/player-values";

interface ValueStatCalloutsProps {
  valueSeries: ValueSeriesPoint[];
  position: string | null;
}

function TrendGlyph({ trend }: { trend: number }) {
  const isUp = trend > 0;
  const colorClass = isUp ? "text-accent-green" : "text-accent-warm";
  return (
    <span className={`inline-flex items-center gap-1 font-mono tabular-nums ${colorClass}`}>
      <span aria-hidden="true">{isUp ? "▲" : "▼"}</span>
      <span className="sr-only">{isUp ? "up" : "down"}</span>
      {Math.abs(trend).toLocaleString()}
    </span>
  );
}

function Callout({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-[7rem] rounded-[10px] border border-border bg-surface px-4 py-3">
      <p className="text-caption text-text-tertiary">{label}</p>
      <p className="text-h3 font-mono tabular-nums text-text-primary mt-1">{value}</p>
    </div>
  );
}

/** 3-up dynasty-value snapshot from the latest valueSeries point. Null when empty. */
export function ValueStatCallouts({
  valueSeries,
  position,
}: ValueStatCalloutsProps) {
  if (valueSeries.length === 0) return null;
  const latest = valueSeries[valueSeries.length - 1];

  const hasAny =
    latest.overallRank != null ||
    latest.positionRank != null ||
    latest.trend30Day != null;
  if (!hasAny) return null;

  return (
    <div className="flex flex-wrap gap-3">
      {latest.overallRank != null && (
        <Callout label="Overall Rank" value={`#${latest.overallRank}`} />
      )}
      {latest.positionRank != null && (
        <Callout
          label="Position Rank"
          value={`${position ?? ""}${latest.positionRank}`}
        />
      )}
      {latest.trend30Day != null && (
        <Callout
          label="30-Day Trend"
          value={<TrendGlyph trend={latest.trend30Day} />}
        />
      )}
    </div>
  );
}
