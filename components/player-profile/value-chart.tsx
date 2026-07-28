import type { ValueSeriesPoint } from "@/lib/queries/player-values";

interface ValueChartProps {
  valueSeries: ValueSeriesPoint[];
}

function formatTickDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const year = d.toLocaleDateString("en-US", { year: "2-digit", timeZone: "UTC" });
  return `${month} '${year}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

interface RenderChartOptions {
  width: number;
  height: number;
  tickCount: number;
  fontSize: number;
  padLeft: number;
}

/**
 * Pure geometry helper: builds the inline SVG markup for the value chart at
 * a given size. All positions derive from the passed dimensions so the same
 * data can be rendered at different sizes (mobile vs desktop) with correctly
 * scaled text, rather than relying on viewBox scaling (which shrinks
 * user-unit font sizes and makes mobile labels unreadable).
 */
function renderChart(valueSeries: ValueSeriesPoint[], options: RenderChartOptions) {
  const { width, height, tickCount, fontSize, padLeft } = options;
  const padRight = 12;
  const padTop = 16;
  const padBottom = 28;

  const dates = valueSeries.map((p) => new Date(`${p.snapshotDate}T00:00:00Z`).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const dateSpan = maxDate - minDate || 1;

  const values = valueSeries.map((p) => p.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  // Pad the value range 8% so the line never touches the top/bottom edge.
  const valuePad = (maxValue - minValue) * 0.08 || Math.max(1, maxValue * 0.08);
  const yMin = minValue - valuePad;
  const yMax = maxValue + valuePad;
  const valueSpan = yMax - yMin || 1;

  const x = (point: ValueSeriesPoint) => {
    const t = new Date(`${point.snapshotDate}T00:00:00Z`).getTime();
    return padLeft + ((t - minDate) / dateSpan) * (width - padLeft - padRight);
  };
  const y = (point: ValueSeriesPoint) => {
    const usable = height - padTop - padBottom;
    return padTop + usable - ((point.value - yMin) / valueSpan) * usable;
  };

  const first = valueSeries[0];
  const last = valueSeries[valueSeries.length - 1];
  const baselineY = padTop + (height - padTop - padBottom);

  const linePath = valueSeries
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p).toFixed(1)},${y(p).toFixed(1)}`)
    .join(" ");

  const areaPath = `M${x(first).toFixed(1)},${baselineY} ${valueSeries
    .map((p) => `L${x(p).toFixed(1)},${y(p).toFixed(1)}`)
    .join(" ")} L${x(last).toFixed(1)},${baselineY} Z`;

  // Min/max markers across the whole series.
  const minPoint = valueSeries.find((p) => p.value === minValue)!;
  const maxPoint = valueSeries.find((p) => p.value === maxValue)!;

  // Value gridlines: 3 evenly spaced ticks between yMin/yMax.
  const valueTicks = [0.25, 0.5, 0.75].map((f) => yMin + valueSpan * f);

  // Date ticks: N ticks evenly spaced in TIME across the full span.
  const n = Math.max(2, tickCount);
  const tickTs = Array.from({ length: n }, (_, i) => minDate + (dateSpan * i) / (n - 1));

  // Source-boundary rule: faint vertical line at the first fantasycalc point,
  // only when the series contains both sources.
  const hasDynastyProcess = valueSeries.some((p) => p.source === "dynastyprocess");
  const hasFantasyCalc = valueSeries.some((p) => p.source === "fantasycalc");
  const isMixedSource = hasDynastyProcess && hasFantasyCalc;
  const firstFantasyCalcPoint = isMixedSource
    ? valueSeries.find((p) => p.source === "fantasycalc")
    : undefined;

  const gradientId = `value-chart-gradient-${width}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className="w-full h-auto"
      role="img"
      aria-label={`Dynasty value over time, from ${Math.round(first.value).toLocaleString()} on ${first.snapshotDate} to ${Math.round(last.value).toLocaleString()} on ${last.snapshotDate}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(226,184,88,.10)" />
          <stop offset="100%" stopColor="rgba(226,184,88,0)" />
        </linearGradient>
      </defs>

      {/* Value gridlines */}
      {valueTicks.map((v, i) => {
        const yy = padTop + (height - padTop - padBottom) - ((v - yMin) / valueSpan) * (height - padTop - padBottom);
        return (
          <g key={i}>
            <line x1={padLeft} x2={width - padRight} y1={yy} y2={yy} stroke="var(--divider)" strokeWidth={1} />
            <text
              x={padLeft - 6}
              y={yy + 3}
              textAnchor="end"
              fontSize={fontSize}
              fontFamily="var(--font-mono)"
              fill="var(--text-muted)"
            >
              {Math.round(v).toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* Axis baseline */}
      <line x1={padLeft} x2={width - padRight} y1={baselineY} y2={baselineY} stroke="var(--divider)" strokeWidth={1} />

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />

      {/* Source boundary rule (mixed-source series only) */}
      {firstFantasyCalcPoint && (
        <line
          x1={x(firstFantasyCalcPoint)}
          x2={x(firstFantasyCalcPoint)}
          y1={padTop}
          y2={baselineY}
          stroke="var(--divider)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      )}

      {/* The single continuous value line */}
      <path d={linePath} fill="none" stroke="var(--accent-gold)" strokeWidth={1.5} />

      {/* Min/max dots */}
      <circle cx={x(maxPoint)} cy={y(maxPoint)} r={3} fill="var(--accent-green)" />
      <circle cx={x(minPoint)} cy={y(minPoint)} r={3} fill="var(--accent-warm)" />

      {/* Date ticks: evenly spaced in time */}
      {tickTs.map((t, i) => {
        const xx = padLeft + ((t - minDate) / dateSpan) * (width - padLeft - padRight);
        const anchor = i === 0 ? "start" : i === tickTs.length - 1 ? "end" : "middle";
        const dateStr = new Date(t).toISOString().slice(0, 10);
        return (
          <text
            key={i}
            x={xx}
            y={height - 8}
            textAnchor={anchor}
            fontSize={fontSize}
            fontFamily="var(--font-mono)"
            fill="var(--text-muted)"
          >
            {formatTickDate(dateStr)}
          </text>
        );
      })}
    </svg>
  );
}

/**
 * The dynasty-value-over-time line: one continuous solid accent-gold line
 * spanning both sources (dynastyprocess historical backfill + fantasycalc
 * daily feed). Both sources are comparable ~0-10000 2QB dynasty scales, so
 * no normalization or visual split is applied to the line itself; a faint
 * vertical rule marks where the live daily feed picks up. Pure inline SVG,
 * zero client JS. Rendered twice (mobile / desktop) via pure CSS visibility
 * so text sizing stays legible at each viewport rather than relying on
 * viewBox scaling.
 */
export function ValueChart({ valueSeries }: ValueChartProps) {
  if (valueSeries.length === 0) {
    return (
      <p className="text-body-sm text-text-tertiary">
        No dynasty value history on file for this one.
      </p>
    );
  }

  const hasDynastyProcess = valueSeries.some((p) => p.source === "dynastyprocess");
  const hasFantasyCalc = valueSeries.some((p) => p.source === "fantasycalc");
  const isMixedSource = hasDynastyProcess && hasFantasyCalc;
  const firstFantasyCalcPoint = isMixedSource
    ? valueSeries.find((p) => p.source === "fantasycalc")
    : undefined;

  return (
    <div>
      <div className="lg:hidden">
        {renderChart(valueSeries, { width: 360, height: 240, tickCount: 4, fontSize: 13, padLeft: 40 })}
      </div>
      <div className="hidden lg:block">
        {renderChart(valueSeries, { width: 720, height: 260, tickCount: 5, fontSize: 11, padLeft: 40 })}
      </div>

      {firstFantasyCalcPoint && (
        <p className="text-caption text-text-tertiary mt-1">
          Tracked live since {formatFullDate(firstFantasyCalcPoint.snapshotDate)}; earlier values are a historical backfill.
        </p>
      )}
    </div>
  );
}
