"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { SeasonSelector } from "@/components/season-selector";
import { EmptyState } from "@/components/empty-state";
import type { LeaderboardEntry } from "@/lib/queries/records";

type SortKey = "wins" | "losses" | "pointsScored" | "pointsAgainst" | "winPct" | "championships";

interface LeaderboardTableProps {
  allTimeData: LeaderboardEntry[];
  seasonData: Record<string, LeaderboardEntry[]>;
  seasonYears: number[];
}

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

  const data = useMemo(() => {
    const source =
      activeSeason === "all-time"
        ? allTimeData
        : seasonData[String(activeSeason)] ?? [];

    return [...source].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      return sortDesc ? bVal - aVal : aVal - bVal;
    });
  }, [activeSeason, allTimeData, seasonData, sortKey, sortDesc]);

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
    return sortDesc ? " \u25BC" : " \u25B2";
  }

  function headerClassForKey(key: SortKey) {
    const isActive = sortKey === key;
    return `pb-3 pr-4 text-xs uppercase tracking-wider font-medium cursor-pointer transition-colors select-none ${
      isActive ? "text-text-primary font-semibold" : "text-text-tertiary hover:text-text-secondary"
    }`;
  }

  return (
    <div className="space-y-6">
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
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="pb-3 pr-4 text-xs uppercase tracking-wider text-text-tertiary font-medium w-12">
                    #
                  </th>
                  <th scope="col" className="pb-3 pr-4 text-xs uppercase tracking-wider text-text-tertiary font-medium">
                    Team
                  </th>
                  <th
                    scope="col"
                    className={`${headerClassForKey("wins")} text-right`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("wins")}
                    onKeyDown={(e) => handleSortKeyDown("wins", e)}
                    aria-sort={sortKey === "wins" ? (sortDesc ? "descending" : "ascending") : undefined}
                  >
                    W{sortIndicator("wins")}
                  </th>
                  <th
                    scope="col"
                    className={`${headerClassForKey("losses")} text-right`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("losses")}
                    onKeyDown={(e) => handleSortKeyDown("losses", e)}
                    aria-sort={sortKey === "losses" ? (sortDesc ? "descending" : "ascending") : undefined}
                  >
                    L{sortIndicator("losses")}
                  </th>
                  <th
                    scope="col"
                    className={`${headerClassForKey("winPct")} text-right`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("winPct")}
                    onKeyDown={(e) => handleSortKeyDown("winPct", e)}
                    aria-sort={sortKey === "winPct" ? (sortDesc ? "descending" : "ascending") : undefined}
                  >
                    Win%{sortIndicator("winPct")}
                  </th>
                  <th
                    scope="col"
                    className={`${headerClassForKey("pointsScored")} text-right`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("pointsScored")}
                    onKeyDown={(e) => handleSortKeyDown("pointsScored", e)}
                    aria-sort={sortKey === "pointsScored" ? (sortDesc ? "descending" : "ascending") : undefined}
                  >
                    PF{sortIndicator("pointsScored")}
                  </th>
                  <th
                    scope="col"
                    className={`${headerClassForKey("pointsAgainst")} text-right`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("pointsAgainst")}
                    onKeyDown={(e) => handleSortKeyDown("pointsAgainst", e)}
                    aria-sort={sortKey === "pointsAgainst" ? (sortDesc ? "descending" : "ascending") : undefined}
                  >
                    PA{sortIndicator("pointsAgainst")}
                  </th>
                  <th
                    scope="col"
                    className={`${headerClassForKey("championships")} text-right`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSort("championships")}
                    onKeyDown={(e) => handleSortKeyDown("championships", e)}
                    aria-sort={sortKey === "championships" ? (sortDesc ? "descending" : "ascending") : undefined}
                  >
                    Titles{sortIndicator("championships")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry, index) => {
                  const rank = index + 1;
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-border/50 last:border-0 hover:bg-surface-muted transition-colors ${
                        index % 2 === 1 ? "bg-surface-muted/30" : ""
                      }`}
                    >
                      <td className="py-4 pr-4">
                        <span
                          className={`text-sm tabular-nums font-bold ${
                            rank <= 3 ? "text-accent-gold" : "text-text-tertiary"
                          }`}
                        >
                          {rank}
                        </span>
                      </td>
                      <td className="py-4 pr-4">
                        <Link
                          href={`/teams/${entry.slug}`}
                          className="hover:opacity-80 transition-opacity"
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
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.championships > 0 && (
                            <SuperlativeBadge
                              text={activeSeason === "all-time" ? `${entry.championships}x Champ` : "Champion"}
                              variant="gold"
                            />
                          )}
                          {rank === 1 && sortKey === "wins" && (
                            <SuperlativeBadge
                              text="Most Wins"
                              variant="green"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-right text-sm tabular-nums font-bold">
                        {entry.wins}
                      </td>
                      <td className="py-4 pr-4 text-right text-sm tabular-nums">
                        {entry.losses}
                      </td>
                      <td className="py-4 pr-4 text-right text-sm tabular-nums">
                        {(entry.winPct * 100).toFixed(1)}%
                      </td>
                      <td className="py-4 pr-4 text-right text-sm tabular-nums">
                        {entry.pointsScored.toFixed(1)}
                      </td>
                      <td className="py-4 pr-4 text-right text-sm tabular-nums text-text-tertiary">
                        {entry.pointsAgainst.toFixed(1)}
                      </td>
                      <td className="py-4 text-right text-sm tabular-nums">
                        {entry.championships}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {data.map((entry, index) => {
              const rank = index + 1;
              return (
                <Link
                  key={entry.id}
                  href={`/teams/${entry.slug}`}
                  className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`text-lg tabular-nums font-bold mt-0.5 ${
                        rank <= 3 ? "text-accent-gold" : "text-text-tertiary"
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
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {entry.championships > 0 && (
                          <SuperlativeBadge
                            text={activeSeason === "all-time" ? `${entry.championships}x Champ` : "Champion"}
                            variant="gold"
                          />
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 mt-2 text-sm">
                        <span className="tabular-nums">
                          <span className="font-bold">{entry.wins}</span>
                          <span className="text-text-tertiary">W</span>
                          <span className="text-text-tertiary mx-0.5">
                            -
                          </span>
                          <span>{entry.losses}</span>
                          <span className="text-text-tertiary">L</span>
                        </span>
                        <span className="text-text-tertiary tabular-nums">
                          {(entry.winPct * 100).toFixed(1)}%
                        </span>
                        <span className="text-text-tertiary tabular-nums">
                          {entry.pointsScored.toFixed(1)} PF
                        </span>
                        <span className="text-text-tertiary tabular-nums">
                          {entry.pointsAgainst.toFixed(1)} PA
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
