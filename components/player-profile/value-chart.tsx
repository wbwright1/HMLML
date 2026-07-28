import type { ValueSeriesPoint } from "@/lib/queries/player-values";

interface ValueChartProps {
  valueSeries: ValueSeriesPoint[];
}

const WIDTH = 720;
const HEIGHT = 260;
const PAD_LEFT = 40;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

interface Segment {
  source: string;
  points: ValueSeriesPoint[];
}

/** Groups consecutive same-source points into segments, preserving order. */
function toSegments(series: ValueSeriesPoint[]): Segment[] {
  const segments: Segment[] = [];
  for (const point of series) {
    const last = segments[segments.length - 1];
    if (last && last.source === point.source) {
      last.points.push(point);
    } else {
      segments.push({ source: point.source, points: [point] });
    }
  }
  return segments;
}

function formatTickDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/**
 * The dynasty-value-over-time line: a single accent-gold series split into
 * source segments (dynastyprocess historical backfill, dashed; fantasycalc
 * daily feed, solid), with NO interpolation drawn across the gap between
 * sources — each segment is its own <path>. Pure inline SVG, zero client JS.
 */
export function ValueChart({ valueSeries }: ValueChartProps) {
  if (valueSeries.length === 0) {
    return (
      <p className="text-body-sm text-text-tertiary">
        No dynasty value history on file for this one.
      </p>
    );
  }

  const segments = toSegments(valueSeries);

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
    return PAD_LEFT + ((t - minDate) / dateSpan) * (WIDTH - PAD_LEFT - PAD_RIGHT);
  };
  const y = (point: ValueSeriesPoint) => {
    const usable = HEIGHT - PAD_TOP - PAD_BOTTOM;
    return PAD_TOP + usable - ((point.value - yMin) / valueSpan) * usable;
  };

  const pathFor = (points: ValueSeriesPoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p).toFixed(1)},${y(p).toFixed(1)}`).join(" ");

  // Area fill under the FULL series (visual continuity), gold gradient fading
  // to transparent — drawn once beneath the line segments.
  const first = valueSeries[0];
  const last = valueSeries[valueSeries.length - 1];
  const baselineY = PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM);
  const areaPath = `M${x(first).toFixed(1)},${baselineY} ${valueSeries
    .map((p) => `L${x(p).toFixed(1)},${y(p).toFixed(1)}`)
    .join(" ")} L${x(last).toFixed(1)},${baselineY} Z`;

  // Min/max markers across the whole series.
  const minPoint = valueSeries.find((p) => p.value === minValue)!;
  const maxPoint = valueSeries.find((p) => p.value === maxValue)!;

  // Value gridlines: 3 evenly spaced ticks between yMin/yMax.
  const valueTicks = [0.25, 0.5, 0.75].map((f) => yMin + valueSpan * f);

  // Date ticks: first date, gap boundary(ies) between segments, last date.
  const dateTickPoints = [first];
  for (let i = 0; i < segments.length - 1; i++) {
    dateTickPoints.push(segments[i].points[segments[i].points.length - 1]);
    dateTickPoints.push(segments[i + 1].points[0]);
  }
  if (dateTickPoints[dateTickPoints.length - 1] !== last) dateTickPoints.push(last);

  const hasDynastyProcess = segments.some((s) => s.source === "dynastyprocess");
  const hasFantasyCalc = segments.some((s) => s.source === "fantasycalc");

  const gradientId = "value-chart-gradient";

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Dynasty value over time, from ${latest(first.value)} on ${first.snapshotDate} to ${latest(last.value)} on ${last.snapshotDate}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(226,184,88,.10)" />
            <stop offset="100%" stopColor="rgba(226,184,88,0)" />
          </linearGradient>
        </defs>

        {/* Value gridlines */}
        {valueTicks.map((v, i) => {
          const yy = PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) - ((v - yMin) / valueSpan) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
          return (
            <g key={i}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={yy}
                y2={yy}
                stroke="var(--divider)"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 6}
                y={yy + 3}
                textAnchor="end"
                fontSize={10}
                fontFamily="var(--font-mono)"
                fill="var(--text-muted)"
              >
                {Math.round(v).toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Axis baseline */}
        <line
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--divider)"
          strokeWidth={1}
        />

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />

        {/* Faint connector across source gaps (no interpolated data value) */}
        {segments.slice(1).map((seg, i) => {
          const prevSeg = segments[i];
          const p1 = prevSeg.points[prevSeg.points.length - 1];
          const p2 = seg.points[0];
          return (
            <line
              key={`gap-${i}`}
              x1={x(p1)}
              y1={y(p1)}
              x2={x(p2)}
              y2={y(p2)}
              stroke="var(--text-muted)"
              strokeWidth={1}
              strokeDasharray="1 3"
              opacity={0.6}
            />
          );
        })}

        {/* Line segments */}
        {segments.map((seg, i) => (
          <path
            key={i}
            d={pathFor(seg.points)}
            fill="none"
            stroke="var(--accent-gold)"
            strokeWidth={1.5}
            strokeDasharray={seg.source === "dynastyprocess" ? "4 3" : undefined}
            opacity={seg.source === "dynastyprocess" ? 0.7 : 1}
          />
        ))}

        {/* Segment-end dots */}
        {segments.map((seg, i) => (
          <g key={`dots-${i}`}>
            <circle cx={x(seg.points[0])} cy={y(seg.points[0])} r={2.5} fill="var(--accent-gold)" />
            <circle
              cx={x(seg.points[seg.points.length - 1])}
              cy={y(seg.points[seg.points.length - 1])}
              r={2.5}
              fill="var(--accent-gold)"
            />
          </g>
        ))}

        {/* Min/max dots */}
        <circle cx={x(maxPoint)} cy={y(maxPoint)} r={3} fill="var(--accent-green)" />
        <circle cx={x(minPoint)} cy={y(minPoint)} r={3} fill="var(--accent-warm)" />

        {/* Date ticks */}
        {dateTickPoints.map((p, i) => (
          <text
            key={i}
            x={x(p)}
            y={HEIGHT - 8}
            textAnchor={i === 0 ? "start" : i === dateTickPoints.length - 1 ? "end" : "middle"}
            fontSize={10}
            fontFamily="var(--font-mono)"
            fill="var(--text-muted)"
          >
            {formatTickDate(p.snapshotDate)}
          </text>
        ))}
      </svg>

      {(hasDynastyProcess || hasFantasyCalc) && (
        <p className="text-caption text-text-tertiary mt-1">
          {hasFantasyCalc && <span>&mdash; FantasyCalc (daily)</span>}
          {hasFantasyCalc && hasDynastyProcess && <span> &middot; </span>}
          {hasDynastyProcess && <span>┄ DynastyProcess (historical)</span>}
        </p>
      )}
    </div>
  );
}

function latest(value: number): string {
  return value.toLocaleString();
}
