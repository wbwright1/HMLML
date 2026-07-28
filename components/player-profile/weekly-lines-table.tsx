import Link from "next/link";
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
  playerId: string;
  position: string | null;
  seasonsPresent: number[];
  selectedSeason: number | null;
  weeklyPoints: PlayerWeeklyPointRow[];
  weeklyStats: PlayerWeeklyStatRow[];
  variant: "modal" | "page";
}

function SeasonPicker({
  playerId,
  seasonsPresent,
  selectedSeason,
  variant,
}: {
  playerId: string;
  seasonsPresent: number[];
  selectedSeason: number | null;
  variant: "modal" | "page";
}) {
  if (seasonsPresent.length <= 1) return null;
  return (
    <nav aria-label="Season" className="flex gap-2 overflow-x-auto pb-1">
      {seasonsPresent.map((year) => {
        const isActive = year === selectedSeason;
        const href = `/players/${playerId}?season=${year}`;
        const className = `shrink-0 rounded-full border px-3 py-1.5 text-body-sm font-medium tabular-nums transition-colors ${
          isActive
            ? "border-accent-gold/30 bg-accent-gold-light text-accent-gold"
            : "border-border bg-surface text-text-tertiary hover:text-text-primary"
        }`;
        // Inside the modal a soft nav keeps the dialog open (the intercepted
        // route re-renders with the new season). On the canonical full page a
        // soft nav to the same path would be INTERCEPTED and pop the modal
        // over the page — a hard navigation stays on the canonical route.
        return variant === "modal" ? (
          <Link
            key={year}
            href={href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {year}
          </Link>
        ) : (
          <a
            key={year}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {year}
          </a>
        );
      })}
    </nav>
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

/**
 * The season's week-by-week line: points + slot + (once player_week_stats is
 * backfilled) position-appropriate stat columns. Mobile renders purpose-built
 * cards (WeeklyLineCard); desktop keeps the original table markup. Both read
 * from the single `buildWeeklyLines` view-model so they can never disagree.
 */
export function WeeklyLinesTable({
  playerId,
  position,
  seasonsPresent,
  selectedSeason,
  weeklyPoints,
  weeklyStats,
  variant,
}: WeeklyLinesTableProps) {
  const statColumns = position ? (STAT_COLUMNS_BY_POSITION[position] ?? []) : [];
  const showStats = weeklyStats.length > 0;
  const lines = buildWeeklyLines(weeklyPoints, weeklyStats);

  return (
    <div className="space-y-4">
      <SeasonPicker
        playerId={playerId}
        seasonsPresent={seasonsPresent}
        selectedSeason={selectedSeason}
        variant={variant}
      />
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
                      {line.rostered ? (
                        <StatusChip status={line.status} />
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
