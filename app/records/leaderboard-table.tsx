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
}

// How many teams make the playoffs; determines the berth line in the
// standings. Derived purely from already-fetched rows, no new query.
const PLAYOFF_BERTH_COUNT = 6;

export function LeaderboardTable({
  allTimeData,
  seasonData,
  seasonYears,
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
  const playoffBerthIds = useMemo(
    () =>
      new Set(
        standingsOrder.slice(0, PLAYOFF_BERTH_COUNT).map((entry) => entry.id)
      ),
    [standingsOrder]
  );

  const data = useMemo(() => {
    return [...source].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      return sortDesc ? bVal - aVal : aVal - bVal;
    });
  }, [source, sortKey, sortDesc]);

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
                {data.map((entry, index) => {
                  const rank = index + 1;
                  const isLeader = leader?.id === entry.id;
                  const isBerth = playoffBerthIds.has(entry.id);
                  const statText = isBerth ? "text-text-primary" : "text-text-tertiary";

                  return (
                    <tr
                      key={entry.id}
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
                })}
              </tbody>
            </table>
          </div>
          <div className="hidden md:block">{PlayoffBerthLegend}</div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {data.map((entry, index) => {
              const rank = index + 1;
              const isLeader = leader?.id === entry.id;
              const isBerth = playoffBerthIds.has(entry.id);
              const statText = isBerth ? "text-text-primary" : "text-text-tertiary";

              return (
                <Link
                  key={entry.id}
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
            })}
          </div>
          <div className="md:hidden">{PlayoffBerthLegend}</div>
        </>
      )}
    </div>
  );
}
