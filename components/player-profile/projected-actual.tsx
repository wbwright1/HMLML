import type { PlayerWeeklyPointRow } from "@/lib/queries/player-profile";

interface ProjectedActualProps {
  seasonYear: number;
  weeklyPoints: PlayerWeeklyPointRow[];
}

/**
 * Actual vs summed-projected points for the selected season, over PLAYED weeks
 * only — comparing a full-season projection against a season that hasn't
 * happened yet would read as a giant fake shortfall. Null when no played week
 * has a projection.
 */
export function ProjectedActual({ seasonYear, weeklyPoints }: ProjectedActualProps) {
  const playedWeeks = weeklyPoints.filter((w) => w.played);
  const withProjection = playedWeeks.filter((w) => w.projectedPoints != null);
  if (withProjection.length === 0) return null;

  const actual = playedWeeks.reduce((sum, w) => sum + w.points, 0);
  const projected = withProjection.reduce(
    (sum, w) => sum + (w.projectedPoints ?? 0),
    0
  );
  const delta = actual - projected;
  const beat = delta > 0;

  return (
    <div className="card-surface p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div>
        <p className="text-caption text-text-tertiary">{seasonYear} Actual</p>
        <p className="text-h3 font-mono tabular-nums text-text-primary">
          {actual.toFixed(1)}
        </p>
      </div>
      <div>
        <p className="text-caption text-text-tertiary">Projected</p>
        <p className="text-h3 font-mono tabular-nums text-text-secondary">
          {projected.toFixed(1)}
        </p>
      </div>
      <div>
        <p className="text-caption text-text-tertiary">
          {delta === 0 ? "On Projection" : beat ? "Beat Projection" : "Under Projection"}
        </p>
        <p
          className={`text-h3 font-mono tabular-nums inline-flex items-center gap-1 ${
            delta === 0
              ? "text-text-secondary"
              : beat
                ? "text-accent-green"
                : "text-accent-warm"
          }`}
        >
          {delta !== 0 && (
            <span aria-hidden="true">{beat ? "▲" : "▼"}</span>
          )}
          {Math.abs(delta).toFixed(1)}
        </p>
      </div>
    </div>
  );
}
