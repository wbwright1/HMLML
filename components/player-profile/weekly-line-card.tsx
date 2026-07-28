import { FranchiseLogo } from "@/components/franchise-logo";
import {
  formatStatSummary,
  type StatColumn,
  type WeeklyLine,
  type WeeklyLineStatus,
} from "./weekly-line-model";

const STATUS_LABEL: Record<WeeklyLineStatus, string> = {
  BYE: "BYE",
  DNP: "DNP",
  START: "START",
  BENCH: "BENCH",
  UPCOMING: "UPCOMING",
  NOT_ROSTERED: "NOT ROSTERED",
};

/**
 * Shared status indicator used by both the mobile card header and the desktop
 * table's Status column. START is bold/primary (the honest "this counted"
 * signal); BENCH, UPCOMING, and NOT ROSTERED are all muted tertiary text —
 * none of them are wins or losses, so none get the win/loss accent colors.
 * BYE and DNP render as small neutral pill chips (BYE is always neutral; DNP
 * gets the warm "coaching malpractice" tint when the manager had the player
 * started that week, and stays neutral otherwise).
 */
export function StatusChip({
  status,
  started = false,
}: {
  status: WeeklyLineStatus;
  /** Whether the player was in a starting slot that week (flavors DNP). */
  started?: boolean;
}) {
  if (status === "BYE") {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-caption text-text-tertiary">
        {STATUS_LABEL[status]}
      </span>
    );
  }
  if (status === "DNP") {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-caption ${
          started
            ? "border-accent-warm/30 bg-accent-warm-light text-accent-warm"
            : "border-border bg-surface text-text-tertiary"
        }`}
      >
        {STATUS_LABEL[status]}
      </span>
    );
  }
  if (status === "START") {
    return (
      <span className="text-body-sm font-semibold text-text-primary">
        {STATUS_LABEL[status]}
      </span>
    );
  }
  return (
    <span className="text-body-sm font-normal text-text-tertiary">
      {STATUS_LABEL[status]}
    </span>
  );
}

function FranchiseCrest({
  franchise,
  size,
}: {
  franchise: { name: string; slug: string | null; avatarUrl: string | null };
  size: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title={franchise.name}>
      <FranchiseLogo
        slug={franchise.slug ?? ""}
        name={franchise.name}
        avatarUrl={franchise.avatarUrl}
        size={size}
        decorative
      />
      <span className="truncate text-body-sm text-text-secondary">
        {franchise.name}
      </span>
    </span>
  );
}

interface WeeklyLineCardProps {
  line: WeeklyLine;
  statColumns: StatColumn[];
  showStats: boolean;
}

/**
 * Mobile card for a single weekly line. Header carries the week + owner +
 * status; a matchup line names the opponent (omitted on stat-only weeks); the
 * hero is the big mono actual-points number with inline projection and delta;
 * a compact mono stat summary line closes it out.
 */
export function WeeklyLineCard({ line, statColumns, showStats }: WeeklyLineCardProps) {
  const summary = showStats ? formatStatSummary(line.stat?.position ?? null, line.stat) : [];
  const showHero = line.rostered && line.actual != null;

  return (
    <div className="rounded-[14px] border border-border bg-surface p-4 space-y-2" role="listitem">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-kicker shrink-0">WK {line.week}</span>
          {line.owner && <FranchiseCrest franchise={line.owner} size={20} />}
        </div>
        <StatusChip status={line.status} started={line.started} />
      </div>

      {line.opponent && (
        <div className="flex items-center gap-1.5 text-body-sm text-text-tertiary min-w-0">
          <span className="shrink-0">vs</span>
          <span className="min-w-0">
            <FranchiseCrest franchise={line.opponent} size={18} />
          </span>
        </div>
      )}

      {showHero ? (
        <div className="flex items-baseline gap-2 pt-1">
          <span className="text-stat text-[28px] leading-none text-text-primary">
            {line.actual!.toFixed(1)}
          </span>
          {line.projected != null && (
            <span className="font-mono text-body-sm tabular-nums text-text-tertiary">
              proj {line.projected.toFixed(1)}
            </span>
          )}
          {line.delta != null &&
            (line.delta === 0 ? (
              <span className="font-mono text-body-sm tabular-nums text-text-secondary">
                0.0
              </span>
            ) : (
              <span
                className={`inline-flex items-center gap-0.5 font-mono text-body-sm tabular-nums ${
                  line.delta > 0 ? "text-accent-green" : "text-accent-warm"
                }`}
              >
                <span aria-hidden="true">{line.delta > 0 ? "▲" : "▼"}</span>
                {Math.abs(line.delta).toFixed(1)}
              </span>
            ))}
        </div>
      ) : line.status === "UPCOMING" && line.projected != null ? (
        <div className="pt-1">
          <span className="font-mono text-body-sm tabular-nums text-text-tertiary">
            proj {line.projected.toFixed(1)}
          </span>
        </div>
      ) : null}

      {summary.length > 0 && (
        <p className="font-mono text-body-sm tabular-nums text-text-secondary">
          {summary.join(" · ")}
        </p>
      )}
    </div>
  );
}
