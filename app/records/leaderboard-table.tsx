"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SeasonSelector } from "@/components/season-selector";
import { EmptyState } from "@/components/empty-state";
import type { LeaderboardEntry } from "@/lib/queries/records";

type SortKey = "wins" | "pointsScored" | "pointsAgainst";

interface LeaderboardTableProps {
  allTimeData: LeaderboardEntry[];
  seasonData: Record<string, LeaderboardEntry[]>;
  seasonYears: number[];
  /**
   * The season year the playoff projection applies to (the current season),
   * and the franchise ids projected INTO its field. When the user selects
   * this season, the berth line uses the real projection (division-winner
   * auto-qualify) so the table agrees with the "Projected Playoff Field"
   * block. Absent for seasons with no projection; those fall back to the
   * straight top-6-by-record berth line below.
   */
  projectionSeasonYear?: number | null;
  projectionFieldIds?: string[];
}

// How many teams make the playoffs; determines the berth line in the
// standings when no real projection applies. Derived purely from
// already-fetched rows, no new query.
const PLAYOFF_BERTH_COUNT = 6;

/** Win percentage (ties count as half), for fair mid-season ordering. */
function winPctOf(e: LeaderboardEntry): number {
  const total = e.wins + e.losses + e.ties;
  return total > 0 ? (e.wins + e.ties * 0.5) / total : 0;
}

export function LeaderboardTable({
  allTimeData,
  seasonData,
  seasonYears,
  projectionSeasonYear,
  projectionFieldIds,
}: LeaderboardTableProps) {
  const [activeSeason, setActiveSeason] = useState<number | "all-time">(
    "all-time"
  );
  const [sortKey, setSortKey] = useState<SortKey>("wins");
  const [sortDesc, setSortDesc] = useState(true);

  const source = useMemo(
    () =>
      activeSeason === "all-time"
        ? allTimeData
        : seasonData[String(activeSeason)] ?? [],
    [activeSeason, allTimeData, seasonData]
  );

  // Standings rank (by record) drives the playoff-berth line and the
  // games-back baseline; independent of whichever column is sorted.
  const standingsOrder = useMemo(
    () =>
      [...source].sort((a, b) => b.wins - a.wins || a.losses - b.losses),
    [source]
  );
  const leader = standingsOrder[0];
  // Prefer the real projection field (division-winner auto-qualify) when the
  // selected season is the projected one; this keeps the table's berth line
  // in agreement with the "Projected Playoff Field" block on the same page.
  // Otherwise (all-time, historical, or no-division seasons) fall back to the
  // straight top-6-by-record line.
  const playoffBerthIds = useMemo(() => {
    if (
      projectionSeasonYear != null &&
      activeSeason === projectionSeasonYear &&
      projectionFieldIds &&
      projectionFieldIds.length > 0
    ) {
      return new Set(projectionFieldIds);
    }
    return new Set(
      standingsOrder.slice(0, PLAYOFF_BERTH_COUNT).map((entry) => entry.id)
    );
  }, [standingsOrder, activeSeason, projectionSeasonYear, projectionFieldIds]);
  const overallRank = useMemo(
    () => new Map(standingsOrder.map((entry, i) => [entry.id, i + 1])),
    [standingsOrder]
  );

  const data = useMemo(() => {
    return [...source].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      return sortDesc ? bVal - aVal : aVal - bVal;
    });
  }, [source, sortKey, sortDesc]);

  // Division grouping: only for a single selected season whose rows carry a
  // division (RISK-B: legacy/no-division seasons fall back to the flat
  // table). All-time never groups by division (career totals span multiple
  // division alignments across seasons).
  const showDivisions =
    activeSeason !== "all-time" && source.some((entry) => entry.division != null);

  const divisionGroups = useMemo(() => {
    if (!showDivisions) return [];
    const groups = new Map<
      string,
      { division: number | null; divisionName: string; entries: LeaderboardEntry[] }
    >();
    for (const entry of source) {
      const key = entry.division != null ? String(entry.division) : "unassigned";
      const divisionName = entry.divisionName ?? "Unassigned";
      if (!groups.has(key)) {
        groups.set(key, { division: entry.division ?? null, divisionName, entries: [] });
      }
      groups.get(key)!.entries.push(entry);
    }
    return [...groups.values()]
      .sort((a, b) => (a.division ?? Infinity) - (b.division ?? Infinity))
      .map((g) => ({
        ...g,
        // RISK-A: sort within division by record (win% DESC so unequal games
        // played mid-season rank fairly, then points), never standingsFinish.
        entries: [...g.entries].sort(
          (a, b) => winPctOf(b) - winPctOf(a) || b.pointsScored - a.pointsScored
        ),
        record: g.entries.reduce(
          (acc, e) => ({
            wins: acc.wins + e.wins,
            losses: acc.losses + e.losses,
            ties: acc.ties + e.ties,
          }),
          { wins: 0, losses: 0, ties: 0 }
        ),
      }));
  }, [showDivisions, source]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function handleSortKeyDown(key: SortKey, e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSort(key);
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDesc ? " ▼" : " ▲";
  }

  function sortableHeaderProps(key: SortKey) {
    const isActive = sortKey === key;
    const ariaSort: "ascending" | "descending" | undefined = isActive
      ? sortDesc
        ? "descending"
        : "ascending"
      : undefined;
    return {
      className:
        "py-3 pr-4 text-right text-kicker cursor-pointer select-none transition-colors hover:text-text-secondary",
      style: isActive ? { color: "var(--text-primary)" } : undefined,
      role: "button" as const,
      tabIndex: 0,
      onClick: () => handleSort(key),
      onKeyDown: (e: React.KeyboardEvent) => handleSortKeyDown(key, e),
      "aria-sort": ariaSort,
    };
  }

  function gamesBack(entry: LeaderboardEntry): string {
    if (!leader || entry.id === leader.id) return "-";
    const gb = leader.wins - entry.wins + (entry.losses - leader.losses);
    const half = gb / 2;
    if (half <= 0) return "-";
    return Number.isInteger(half) ? String(half) : half.toFixed(1);
  }

  function record(entry: LeaderboardEntry): string {
    return `${entry.wins}-${entry.losses}${entry.ties > 0 ? `-${entry.ties}` : ""}`;
  }

  const PlayoffBerthLegend = (
    <p className="flex items-center gap-2 text-caption text-text-tertiary">
      <span
        className="inline-block w-2.5 h-2.5 rounded-[3px] bg-text-tertiary/30"
        aria-hidden="true"
      />
      Playoff berth &middot; top {PLAYOFF_BERTH_COUNT}
    </p>
  );

  return (
    <div className="space-y-4">
      <SeasonSelector
        seasons={seasonYears}
        activeSeason={activeSeason}
        onSelect={setActiveSeason}
        showAllTime
      />

      {data.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No Leaderboard Data"
          description={`No leaderboard data available${activeSeason !== "all-time" ? ` for ${activeSeason}` : ""}.`}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-[14px] border border-border bg-surface">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-3 pl-4 pr-2 text-left text-kicker w-10">
                    #
                  </th>
                  <th scope="col" className="py-3 pr-4 text-left text-kicker">
                    Team
                  </th>
                  <th scope="col" {...sortableHeaderProps("wins")}>
                    Rec{sortIndicator("wins")}
                  </th>
                  <th scope="col" {...sortableHeaderProps("pointsScored")}>
                    PF{sortIndicator("pointsScored")}
                  </th>
                  <th scope="col" {...sortableHeaderProps("pointsAgainst")}>
                    PA{sortIndicator("pointsAgainst")}
                  </th>
                  <th scope="col" className="py-3 pr-4 text-right text-kicker">
                    GB
                  </th>
                </tr>
              </thead>
              <tbody>
                {showDivisions
                  ? divisionGroups.map((group) => (
                      <DivisionDesktopRows
                        key={group.division ?? "unassigned"}
                        group={group}
                        leader={leader}
                        playoffBerthIds={playoffBerthIds}
                        overallRank={overallRank}
                        gamesBack={gamesBack}
                        record={record}
                      />
                    ))
                  : data.map((entry, index) => (
                      <DesktopRow
                        key={entry.id}
                        entry={entry}
                        rank={index + 1}
                        isLeader={leader?.id === entry.id}
                        isBerth={playoffBerthIds.has(entry.id)}
                        gamesBack={gamesBack}
                        record={record}
                      />
                    ))}
              </tbody>
            </table>
          </div>
          <div className="hidden md:block">{PlayoffBerthLegend}</div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-4">
            {showDivisions
              ? divisionGroups.map((group) => (
                  <div key={group.division ?? "unassigned"} className="space-y-2">
                    <DivisionHeader group={group} />
                    {group.entries.map((entry) => (
                      <MobileCard
                        key={entry.id}
                        entry={entry}
                        rank={overallRank.get(entry.id) ?? 0}
                        isLeader={leader?.id === entry.id}
                        isBerth={playoffBerthIds.has(entry.id)}
                        record={record}
                      />
                    ))}
                  </div>
                ))
              : data.map((entry, index) => (
                  <MobileCard
                    key={entry.id}
                    entry={entry}
                    rank={index + 1}
                    isLeader={leader?.id === entry.id}
                    isBerth={playoffBerthIds.has(entry.id)}
                    record={record}
                  />
                ))}
          </div>
          <div className="md:hidden">{PlayoffBerthLegend}</div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Division grouping helpers
// ---------------------------------------------------------------------------

interface DivisionGroupData {
  division: number | null;
  divisionName: string;
  entries: LeaderboardEntry[];
  record: { wins: number; losses: number; ties: number };
}

function DivisionHeader({ group }: { group: DivisionGroupData }) {
  const { wins, losses, ties } = group.record;
  return (
    <p className="flex items-center justify-between px-1 pt-2 text-kicker text-accent-gold">
      <span>{group.divisionName}</span>
      <span className="font-mono tabular-nums text-text-tertiary normal-case tracking-normal">
        {wins}-{losses}
        {ties > 0 ? `-${ties}` : ""}
      </span>
    </p>
  );
}

function DivisionDesktopRows({
  group,
  leader,
  playoffBerthIds,
  overallRank,
  gamesBack,
  record,
}: {
  group: DivisionGroupData;
  leader: LeaderboardEntry | undefined;
  playoffBerthIds: Set<string>;
  overallRank: Map<string, number>;
  gamesBack: (entry: LeaderboardEntry) => string;
  record: (entry: LeaderboardEntry) => string;
}) {
  return (
    <>
      <tr className="border-b border-divider bg-surface-muted">
        <td colSpan={6} className="py-2 px-4">
          <DivisionHeader group={group} />
        </td>
      </tr>
      {group.entries.map((entry) => (
        <DesktopRow
          key={entry.id}
          entry={entry}
          rank={overallRank.get(entry.id) ?? 0}
          isLeader={leader?.id === entry.id}
          isBerth={playoffBerthIds.has(entry.id)}
          gamesBack={gamesBack}
          record={record}
        />
      ))}
    </>
  );
}

function DesktopRow({
  entry,
  rank,
  isLeader,
  isBerth,
  gamesBack,
  record,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isLeader: boolean;
  isBerth: boolean;
  gamesBack: (entry: LeaderboardEntry) => string;
  record: (entry: LeaderboardEntry) => string;
}) {
  const statText = isBerth ? "text-text-primary" : "text-text-tertiary";

  return (
    <tr
      data-berth={isBerth}
      className={`border-b border-divider last:border-0 transition-colors hover:bg-surface-muted ${
        isLeader ? "bg-accent-gold-light" : ""
      }`}
    >
      <td
        className={`py-3.5 pl-4 pr-2 font-mono text-sm tabular-nums font-bold ${
          isLeader ? "text-accent-gold" : statText
        }`}
      >
        {rank}
      </td>
      <td className="py-3.5 pr-4">
        <Link
          href={`/teams/${entry.slug}`}
          className="inline-block hover:opacity-80 transition-opacity"
        >
          <FranchiseIdentity
            franchise={{
              slug: entry.slug,
              name: entry.name,
              abbreviation: entry.abbreviation,
              brandingColor: entry.brandingColor,
            }}
            championships={entry.championships}
            variant="compact"
          />
        </Link>
      </td>
      <td className={`py-3.5 pr-4 font-mono text-sm tabular-nums font-bold ${statText}`}>
        {record(entry)}
      </td>
      <td className={`py-3.5 pr-4 font-mono text-sm tabular-nums ${statText}`}>
        {entry.pointsScored.toFixed(1)}
      </td>
      <td className={`py-3.5 pr-4 font-mono text-sm tabular-nums ${statText}`}>
        {entry.pointsAgainst.toFixed(1)}
      </td>
      <td className={`py-3.5 pr-4 text-right font-mono text-sm tabular-nums ${statText}`}>
        {gamesBack(entry)}
      </td>
    </tr>
  );
}

function MobileCard({
  entry,
  rank,
  isLeader,
  isBerth,
  record,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isLeader: boolean;
  isBerth: boolean;
  record: (entry: LeaderboardEntry) => string;
}) {
  const statText = isBerth ? "text-text-primary" : "text-text-tertiary";

  return (
    <Link
      href={`/teams/${entry.slug}`}
      className={`flex items-center gap-3 rounded-[14px] border border-border p-3 transition-colors hover:border-border-strong ${
        isLeader ? "bg-accent-gold-light" : "bg-surface"
      }`}
    >
      <span
        className={`font-mono text-sm tabular-nums font-bold w-5 shrink-0 text-center ${
          isLeader ? "text-accent-gold" : statText
        }`}
      >
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <FranchiseIdentity
          franchise={{
            slug: entry.slug,
            name: entry.name,
            abbreviation: entry.abbreviation,
            brandingColor: entry.brandingColor,
          }}
          championships={entry.championships}
          variant="compact"
        />
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className={`font-mono text-sm tabular-nums font-bold ${statText}`}>
          {record(entry)}
        </span>
        <span className="font-mono text-xs tabular-nums text-text-tertiary">
          {entry.pointsScored.toFixed(1)} PF
        </span>
      </div>
    </Link>
  );
}
