"use client";

import { useState, useMemo, useCallback, type KeyboardEvent } from "react";
import Link from "next/link";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { PositionBadge } from "@/components/position-badge";
import { EmptyState } from "@/components/empty-state";
import type { RosteredPlayer } from "@/lib/queries/players";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"] as const;
type PositionFilter = (typeof POSITIONS)[number];

type SortKey =
  | "name"
  | "position"
  | "nflTeam"
  | "points"
  | "age"
  | "yearsExp"
  | "hmlTeam"
  | "status";
type SortDir = "asc" | "desc";

const POSITION_ORDER: Record<string, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
};

function getPositionOrder(pos: string | null): number {
  return pos ? (POSITION_ORDER[pos] ?? 6) : 6;
}

function compareValues(
  a: RosteredPlayer,
  b: RosteredPlayer,
  key: SortKey,
  dir: SortDir
): number {
  let cmp = 0;

  switch (key) {
    case "name":
      cmp = (a.fullName ?? "").localeCompare(b.fullName ?? "");
      break;
    case "position":
      cmp = getPositionOrder(a.position) - getPositionOrder(b.position);
      if (cmp === 0) cmp = (a.fullName ?? "").localeCompare(b.fullName ?? "");
      break;
    case "nflTeam":
      cmp = (a.nflTeam ?? "ZZZ").localeCompare(b.nflTeam ?? "ZZZ");
      break;
    case "points":
      cmp = (a.pointsPpr ?? 0) - (b.pointsPpr ?? 0);
      break;
    case "age":
      cmp = (a.age ?? 0) - (b.age ?? 0);
      break;
    case "yearsExp":
      cmp = (a.yearsExp ?? 0) - (b.yearsExp ?? 0);
      break;
    case "hmlTeam":
      cmp = (a.ownerFranchiseName ?? "").localeCompare(
        b.ownerFranchiseName ?? ""
      );
      break;
    case "status": {
      const sa = a.injuryStatus ?? a.status ?? "Active";
      const sb = b.injuryStatus ?? b.status ?? "Active";
      cmp = sa.localeCompare(sb);
      break;
    }
  }

  return dir === "desc" ? -cmp : cmp;
}

function StatusIndicator({
  status,
  injuryStatus,
}: {
  status: string | null;
  injuryStatus: string | null;
}) {
  if (injuryStatus) {
    const injuryLabels: Record<string, { text: string; className: string }> = {
      Out: { text: "OUT", className: "text-orange-400 bg-orange-500/15" },
      Doubtful: {
        text: "DOUBTFUL",
        className: "text-orange-400 bg-orange-500/15",
      },
      Questionable: {
        text: "Q",
        className: "text-amber-400 bg-amber-500/15",
      },
      IR: { text: "IR", className: "text-orange-400 bg-orange-500/15" },
      PUP: { text: "PUP", className: "text-orange-400 bg-orange-500/15" },
      Suspended: {
        text: "SUSP",
        className: "text-orange-400 bg-orange-500/15",
      },
      NFI: { text: "NFI", className: "text-orange-400 bg-orange-500/15" },
      COV: { text: "COVID", className: "text-orange-400 bg-orange-500/15" },
    };

    const config = injuryLabels[injuryStatus] ?? {
      text: injuryStatus.toUpperCase(),
      className: "text-amber-400 bg-amber-500/15",
    };

    return (
      <span
        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${config.className}`}
      >
        {config.text}
      </span>
    );
  }

  if (status && status !== "Active") {
    return (
      <span className="inline-block text-xs px-2 py-0.5 rounded-full text-muted-foreground bg-muted">
        {status}
      </span>
    );
  }

  return <span className="text-sm text-muted-foreground">-</span>;
}

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  align = "left",
}: SortHeaderProps) {
  const isActive = activeKey === sortKey;

  const handleKeyDown = (e: KeyboardEvent<HTMLTableCellElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSort(sortKey);
    }
  };

  return (
    <th
      role="button"
      tabIndex={0}
      onClick={() => onSort(sortKey)}
      onKeyDown={handleKeyDown}
      className={`pb-3 pr-4 text-xs uppercase tracking-wider text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={
        isActive ? (activeDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        {label}
        {isActive ? (
          activeDir === "asc" ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )
        ) : (
          <span className="size-3" aria-hidden="true" />
        )}
      </span>
    </th>
  );
}

type RosterFilter = "ALL" | "FA" | string; // string = franchise ID

interface PlayerTableProps {
  players: RosteredPlayer[];
  franchises: { id: string; name: string; slug: string }[];
  statsSeason: number | null;
}

export function PlayerTable({ players, franchises, statsSeason }: PlayerTableProps) {
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState<PositionFilter>("ALL");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("FA");
  const [sortKey, setSortKey] = useState<SortKey>("points");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        // Default to desc for points, asc for everything else
        setSortDir(key === "points" ? "desc" : "asc");
      }
    },
    [sortKey]
  );

  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    let result = players;

    // Roster filter
    if (rosterFilter === "FA") {
      result = result.filter((p) => !p.ownerFranchiseId);
    } else if (rosterFilter !== "ALL") {
      result = result.filter((p) => p.ownerFranchiseId === rosterFilter);
    }

    // Position filter
    if (posFilter !== "ALL") {
      result = result.filter((p) => p.position === posFilter);
    }

    // Text search
    if (searchLower) {
      result = result.filter((p) => {
        const name = (p.fullName ?? "").toLowerCase();
        const team = (p.nflTeam ?? "").toLowerCase();
        const hml = (p.ownerFranchiseName ?? "").toLowerCase();
        return (
          name.includes(searchLower) ||
          team.includes(searchLower) ||
          hml.includes(searchLower)
        );
      });
    }

    return [...result].sort((a, b) => compareValues(a, b, sortKey, sortDir));
  }, [players, search, posFilter, rosterFilter, sortKey, sortDir]);

  const ptsLabel = statsSeason ? `${statsSeason} Pts` : "Pts";

  // Roster filter label for display
  const rosterLabel =
    rosterFilter === "FA"
      ? "Free Agents"
      : rosterFilter === "ALL"
        ? "All Players"
        : franchises.find((f) => f.id === rosterFilter)?.name ?? "Team";

  return (
    <div className="mt-8 space-y-8">
      {/* Search bar */}
      <div style={{ position: "relative", width: "100%" }}>
        <label htmlFor="player-filter" className="sr-only">
          Filter players
        </label>
        <svg
          style={{ position: "absolute", left: "1.25rem", top: "50%", transform: "translateY(-50%)", width: "1.25rem", height: "1.25rem", color: "var(--muted-foreground)", pointerEvents: "none" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          id="player-filter"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players, NFL teams, or HMLML teams..."
          autoComplete="off"
          style={{ paddingLeft: "3.25rem", paddingRight: "1.25rem", paddingTop: "1rem", paddingBottom: "1rem", fontSize: "1.125rem", width: "100%", borderRadius: "0.75rem", border: "1px solid var(--border)", backgroundColor: "var(--card)", outline: "none", color: "var(--foreground)" }}
        />
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left side: position pills */}
        <div className="flex items-center gap-4">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium shrink-0">
            Position
          </span>
          <div className="flex gap-2" role="radiogroup" aria-label="Position filter">
            {POSITIONS.map((pos) => {
              const isActive = posFilter === pos;
              return (
                <button
                  key={pos}
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setPosFilter(pos)}
                  style={{
                    minWidth: "3.25rem",
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    textAlign: "center",
                    cursor: "pointer",
                    border: "none",
                    transition: "all 150ms",
                    ...(isActive
                      ? { backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }
                      : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)" }),
                  }}
                >
                  {pos}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right side: roster selector */}
        <div className="flex items-center gap-4">
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium shrink-0">
            Roster
          </span>
          <div style={{ position: "relative", display: "inline-block" }}>
            <select
              id="roster-filter"
              value={rosterFilter}
              onChange={(e) => setRosterFilter(e.target.value)}
              style={{
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
                borderRadius: "0.5rem",
                backgroundColor: "var(--border)",
                paddingLeft: "1rem",
                paddingRight: "2.5rem",
                paddingTop: "0.5rem",
                paddingBottom: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--foreground)",
                border: "none",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="FA">Free Agents</option>
              <option value="ALL">All Players</option>
              <optgroup label="Teams">
                {franchises.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <svg
              style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", width: "1rem", height: "1rem", color: "var(--muted-foreground)", pointerEvents: "none" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      {/* Result count */}
      <p className="text-sm text-muted-foreground tabular-nums">
        <span className="font-semibold text-foreground">{filtered.length}</span>
        {" "}of {players.length} players
      </p>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border">
              <SortHeader
                label="Player"
                sortKey="name"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Pos"
                sortKey="position"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="NFL Team"
                sortKey="nflTeam"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label={ptsLabel}
                sortKey="points"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortHeader
                label="Age"
                sortKey="age"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Exp"
                sortKey="yearsExp"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="HMLML Team"
                sortKey="hmlTeam"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Status"
                sortKey="status"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
              />
            </tr>
          </thead>
          <tbody>
            {filtered.map((player) => (
              <tr
                key={player.id}
                className="border-b border-border/50 last:border-0"
              >
                <td className="py-4 pr-4">
                  <span className="text-sm font-medium">
                    {player.fullName ?? "Unknown"}
                  </span>
                </td>
                <td className="py-4 pr-4">
                  <PositionBadge position={player.position} />
                </td>
                <td className="py-4 pr-4">
                  <span className="text-sm text-muted-foreground">
                    {player.nflTeam ?? "FA"}
                  </span>
                </td>
                <td className="py-4 pr-4 text-right">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {player.pointsPpr != null
                      ? player.pointsPpr.toFixed(1)
                      : "-"}
                  </span>
                </td>
                <td className="py-4 pr-4">
                  <span className="text-sm text-muted-foreground">
                    {player.age ?? "-"}
                  </span>
                </td>
                <td className="py-4 pr-4">
                  <span className="text-sm text-muted-foreground">
                    {player.yearsExp != null ? player.yearsExp : "-"}
                  </span>
                </td>
                <td className="py-4 pr-4">
                  {player.ownerFranchiseSlug && player.ownerFranchiseName ? (
                    <Link
                      href={`/teams/${player.ownerFranchiseSlug}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {player.ownerFranchiseName}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">
                      Free Agent
                    </span>
                  )}
                </td>
                <td className="py-4">
                  <StatusIndicator
                    status={player.status}
                    injuryStatus={player.injuryStatus}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map((player) => (
          <div
            key={player.id}
            className="rounded-xl border border-border bg-card p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {player.fullName ?? "Unknown"}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <PositionBadge position={player.position} />
                  <span className="text-xs text-muted-foreground">
                    {player.nflTeam ?? "FA"}
                  </span>
                  {player.age != null && (
                    <span className="text-xs text-muted-foreground">
                      Age {player.age}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                {player.pointsPpr != null ? (
                  <p className="text-sm font-semibold tabular-nums">
                    {player.pointsPpr.toFixed(1)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">-</p>
                )}
                <StatusIndicator
                  status={player.status}
                  injuryStatus={player.injuryStatus}
                />
              </div>
            </div>
            <div className="pt-1 border-t border-border/50">
              <span className="text-xs text-muted-foreground">HMLML Team: </span>
              {player.ownerFranchiseSlug && player.ownerFranchiseName ? (
                <Link
                  href={`/teams/${player.ownerFranchiseSlug}`}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {player.ownerFranchiseName}
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  Free Agent
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty filtered state */}
      {filtered.length === 0 && (
        <EmptyState
          icon="search"
          title="No Players Found"
          description={search ? `No players match "${search}". Check the spelling or try a different name.` : "No players match your filters."}
        />
      )}
    </div>
  );
}
