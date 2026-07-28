import { FranchiseLogo } from "@/components/franchise-logo";
import type {
  PlayerWeeklyPointRow,
  PlayerWeeklyStatRow,
} from "@/lib/queries/player-profile";
import {
  buildWeeklyLines,
  STAT_COLUMNS_BY_POSITION,
} from "./weekly-line-model";
import { StatusChip, WeeklyLineCard } from "./weekly-line-card";

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

/**
 * The season's week-by-week line: points + slot + (once player_week_stats is
 * backfilled) position-appropriate stat columns. Mobile renders purpose-built
 * cards (WeeklyLineCard); desktop keeps the original table markup. Both read
 * from the single `buildWeeklyLines` view-model so they can never disagree.
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
        <>
          {/* Mobile: purpose-built stat cards (hidden on md+) */}
          <div className="md:hidden space-y-3" role="list">
            {lines.map((line) => (
              <WeeklyLineCard
                key={line.week}
                line={line}
                statColumns={statColumns}
                showStats={showStats}
              />
            ))}
          </div>

          {/* Desktop: full HTML table (hidden below md), visually unchanged */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  {[
                    "Week",
                    "Owner",
                    "Opp",
                    "Slot",
                    "Status",
                    "Proj",
                    "Actual",
                    "Δ",
                    ...(showStats ? statColumns.map((c) => c.label) : []),
                  ].map((header) => (
                    <th
                      key={header}
                      className="pb-3 pr-4 last:pr-0 text-left text-kicker"
                    >
                      {header}
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
                    <td className="py-4 pr-4 text-sm text-text-secondary tabular-nums">
                      {line.week}
                    </td>
                    <td className="py-4 pr-4 text-sm text-text-secondary tabular-nums">
                      {line.owner ? (
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
                      ) : (
                        <span className="text-text-tertiary">&ndash;</span>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-sm text-text-secondary tabular-nums">
                      {line.opponent ? (
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
                      ) : (
                        <span className="text-text-tertiary">&ndash;</span>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-sm text-text-secondary tabular-nums">
                      {line.slot ?? "–"}
                    </td>
                    <td className="py-4 pr-4 text-sm text-text-secondary tabular-nums">
                      {line.status !== "NOT_ROSTERED" ? (
                        <StatusChip status={line.status} started={line.started} />
                      ) : (
                        <span className="text-text-tertiary">&ndash;</span>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-sm text-text-secondary tabular-nums">
                      {line.projected != null ? line.projected.toFixed(1) : "–"}
                    </td>
                    <td className="py-4 pr-4 text-sm text-text-secondary tabular-nums">
                      {line.actual != null ? line.actual.toFixed(1) : "–"}
                    </td>
                    <td className="py-4 pr-4 text-sm text-text-secondary tabular-nums">
                      <DeltaCell delta={line.delta} />
                    </td>
                    {showStats &&
                      statColumns.map((col) => {
                        const value = line.stat ? line.stat[col.key] : null;
                        return (
                          <td
                            key={col.key}
                            className="py-4 pr-4 last:pr-0 text-sm text-text-secondary tabular-nums"
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
        </>
      )}
    </div>
  );
}
