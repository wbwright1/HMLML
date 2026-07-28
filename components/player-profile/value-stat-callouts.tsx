import type { ValueSeriesPoint } from "@/lib/queries/player-values";

interface ValueStatCalloutsProps {
  valueSeries: ValueSeriesPoint[];
  position: string | null;
}

function TrendGlyph({ trend, pct }: { trend: number; pct: number | null }) {
  const isUp = trend > 0;
  const colorClass = isUp ? "text-accent-green" : "text-accent-warm";
  return (
    <span className={`inline-flex items-center gap-1 font-mono tabular-nums ${colorClass}`}>
      <span aria-hidden="true">{isUp ? "▲" : "▼"}</span>
      <span className="sr-only">{isUp ? "up" : "down"}</span>
      {Math.abs(trend).toLocaleString()}
      {pct != null && <span>({pct > 0 ? "+" : ""}{pct}%)</span>}
    </span>
  );
}

function Callout({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 min-w-[7rem] rounded-[10px] border border-border bg-surface px-4 py-3">
      <p className="text-caption text-text-tertiary">{label}</p>
      <p
        className={`font-mono tabular-nums mt-1 ${
          accent ? "text-h3 text-accent-gold" : "text-h3 text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** Dynasty-value snapshot from the latest valueSeries point. Null when empty. */
export function ValueStatCallouts({
  valueSeries,
  position,
}: ValueStatCalloutsProps) {
  if (valueSeries.length === 0) return null;
  const latest = valueSeries[valueSeries.length - 1];

  const hasAny =
    latest.value != null ||
    latest.overallRank != null ||
    latest.positionRank != null ||
    latest.trend30Day != null;
  if (!hasAny) return null;

  let trendPct: number | null = null;
  if (latest.trend30Day != null) {
    const prior = latest.value - latest.trend30Day;
    if (prior > 0) {
      trendPct = Math.round((latest.trend30Day / prior) * 100);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Callout
        label="Dynasty Value"
        value={Math.round(latest.value).toLocaleString()}
        accent
      />
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
          value={<TrendGlyph trend={latest.trend30Day} pct={trendPct} />}
        />
      )}
    </div>
  );
}
