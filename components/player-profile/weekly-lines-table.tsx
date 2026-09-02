import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";
import type {
  PlayerWeeklyPointRow,
  PlayerWeeklyStatRow,
} from "@/lib/queries/player-profile";
import {
  buildWeeklyLines,
  STAT_COLUMNS_BY_POSITION,
} from "./weekly-line-model";
import type { WeeklyLineStatus } from "./weekly-line-model";

interface WeeklyLinesTableProps {
  position: string | null;
  selectedSeason: number | null;
  weeklyPoints: PlayerWeeklyPointRow[];
  weeklyStats: PlayerWeeklyStatRow[];
  /** The player's (current) NFL team, for team-bye resolution. Null degrades to no BYE labels. */
  nflTeam: string | null;
  /** key: `${seasonYear}:${normalizedTeam}` -> that team's bye week. From getSeasonScheduleFacts. */
  teamByeWeeks: Map<string, number>;
  /** key: `${seasonYear}:${week}` -> true when that week has actually been played. From getSeasonScheduleFacts. */
  completeWeeks: Set<string>;
}

const STATUS_LABEL: Record<WeeklyLineStatus, string> = {
  BYE: "BYE",
  DNP: "DNP",
  START: "START",
  BENCH: "BENCH",
  UPCOMING: "UPCOMING",
  NOT_ROSTERED: "NOT ROSTERED",
};

/**
 * Shared status indicator used by the AVL column. START is bold/primary (the
 * honest "this counted" signal); BENCH, UPCOMING, and NOT ROSTERED are all
 * muted tertiary text — none of them are wins or losses, so none get the
 * win/loss accent colors. BYE and DNP render as small neutral pill chips (BYE
 * is always neutral; DNP gets the warm "coaching malpractice" tint when the
 * manager had the player started that week, and stays neutral otherwise).
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

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-text-tertiary">&ndash;</span>;
  if (delta === 0) return <span className="font-mono tabular-nums text-text-secondary">0.0</span>;
  const beat = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono tabular-nums ${
        beat ? "text-accent-green" : "text-accent-warm"
      }`}
    >
      <span aria-hidden="true">{beat ? "▲" : "▼"}</span>
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}

// Shared cell padding, matching app/players/player-table.tsx and the roster
// page's desktop tables so every table on the site reads as one system.
const TH_CLASS =
  "px-2.5 py-2.5 md:px-0 md:pr-4 md:py-3 text-caption text-text-tertiary text-left";
const TD_CLASS = "px-2.5 py-2.5 md:px-0 md:pr-4 md:py-3";

/**
 * The season's week-by-week line: points + slot + (once player_week_stats is
 * backfilled) position-appropriate stat columns. Renders as a single
 * horizontally-scrolling table at every breakpoint (no separate mobile card
 * stack) so the modal and full-page variants always render identically; the
 * modal's dialog has a permanent transform, which breaks descendant
 * `position: sticky`, so this table intentionally has no sticky column.
 */
export function WeeklyLinesTable({
  position,
  selectedSeason,
  weeklyPoints,
  weeklyStats,
  nflTeam,
  teamByeWeeks,
  completeWeeks,
}: WeeklyLinesTableProps) {
  const statColumns = position ? (STAT_COLUMNS_BY_POSITION[position] ?? []) : [];
  const showStats = weeklyStats.length > 0;
  const lines = selectedSeason
    ? buildWeeklyLines(weeklyPoints, weeklyStats, {
        seasonYear: selectedSeason,
        nflTeam,
        teamByeWeeks,
        completeWeeks,
      })
    : [];

  return (
    <div className="space-y-4">
      {lines.length === 0 ? (
        <p className="text-body-sm text-text-tertiary">
          No weekly lines recorded for this season.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-divider">
                <th className={TH_CLASS} title="Week" aria-label="Week">
                  WK
                </th>
                <th
                  className={TH_CLASS}
                  title="Fantasy manager that week"
                  aria-label="Fantasy manager that week"
                >
                  OWN
                </th>
                <th className={TH_CLASS} title="Opponent" aria-label="Opponent">
                  OPP
                </th>
                <th
                  className={TH_CLASS}
                  title="Lineup slot"
                  aria-label="Lineup slot"
                >
                  SLOT
                </th>
                <th
                  className={TH_CLASS}
                  title="Availability / lineup status"
                  aria-label="Availability / lineup status"
                >
                  AVL
                </th>
                <th
                  className={`${TH_CLASS} text-right`}
                  title="Projected points"
                  aria-label="Projected points"
                >
                  PROJ
                </th>
                <th
                  className={`${TH_CLASS} text-right`}
                  title="Actual points scored"
                  aria-label="Actual points scored"
                >
                  ACT
                </th>
                <th
                  className={`${TH_CLASS} text-right`}
                  title="Actual minus projected"
                  aria-label="Actual minus projected"
                >
                  Δ
                </th>
                {showStats &&
                  statColumns.map((col) => (
                    <th key={col.key} className={`${TH_CLASS} text-right`}>
                      {col.label}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr
                  key={line.week}
                  className="border-b border-divider last:border-0"
                >
                  <td className={`${TD_CLASS} text-stat font-mono text-text-secondary`}>
                    {line.week}
                  </td>
                  <td className={TD_CLASS}>
                    {line.owner ? (
                      <TeamLink
                        slug={line.owner.slug}
                        className="inline-flex"
                      >
                        <span className="inline-flex" title={line.owner.name}>
                          <FranchiseLogo
                            slug={line.owner.slug ?? ""}
                            name={line.owner.name}
                            avatarUrl={line.owner.avatarUrl}
                            size={24}
                            decorative
                          />
                          <span className="sr-only">{line.owner.name}</span>
                        </span>
                      </TeamLink>
                    ) : (
                      <span className="text-text-tertiary">&ndash;</span>
                    )}
                  </td>
                  <td className={TD_CLASS}>
                    {line.opponent ? (
                      <TeamLink
                        slug={line.opponent.slug}
                        className="inline-flex"
                      >
                        <span className="inline-flex" title={line.opponent.name}>
                          <FranchiseLogo
                            slug={line.opponent.slug ?? ""}
                            name={line.opponent.name}
                            avatarUrl={line.opponent.avatarUrl}
                            size={24}
                            decorative
                          />
                          <span className="sr-only">{line.opponent.name}</span>
                        </span>
                      </TeamLink>
                    ) : (
                      <span className="text-text-tertiary">&ndash;</span>
                    )}
                  </td>
                  <td className={`${TD_CLASS} text-text-secondary`}>
                    {line.slot ?? "–"}
                  </td>
                  <td className={TD_CLASS}>
                    {line.status !== "NOT_ROSTERED" ? (
                      <StatusChip status={line.status} started={line.started} />
                    ) : (
                      <span className="text-text-tertiary">&ndash;</span>
                    )}
                  </td>
                  <td className={`${TD_CLASS} text-right text-stat font-mono text-text-tertiary`}>
                    {line.projected != null ? line.projected.toFixed(1) : "–"}
                  </td>
                  <td className={`${TD_CLASS} text-right text-stat font-mono text-text-primary`}>
                    {line.actual != null ? line.actual.toFixed(1) : "–"}
                  </td>
                  <td className={`${TD_CLASS} text-right`}>
                    <DeltaCell delta={line.delta} />
                  </td>
                  {showStats &&
                    statColumns.map((col) => {
                      const value = line.stat ? line.stat[col.key] : null;
                      return (
                        <td
                          key={col.key}
                          className={`${TD_CLASS} text-right text-stat font-mono text-text-secondary`}
                        >
                          {value != null ? value.toString() : "–"}
                        </td>
                      );
                    })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
