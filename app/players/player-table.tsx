"use client";

import { useState, useMemo, useCallback, type KeyboardEvent } from "react";
import Link from "next/link";
import { Search, ChevronUp, ChevronDown, ArrowUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlayerHeadshot } from "@/components/player-headshot";
import { EmptyState } from "@/components/empty-state";
import type { RosteredPlayer } from "@/lib/queries/players";

/**
 * A RosteredPlayer enriched with the current-week PROJ signal and the
 * trending-adds signal. Both fields are null when the page has no data for
 * that player (no sync yet, or the player isn't in the trending list); the
 * table decides whether to show the PROJ/TRD columns at all via
 * showProjColumn / showTrdColumn, computed once in the page from whether any
 * player has a non-null value.
 */
export interface PlayerRow extends RosteredPlayer {
  projPoints: number | null;
  trendingCount: number | null;
}

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"] as const;
type PositionFilter = (typeof POSITIONS)[number];

type SortKey = "name" | "points" | "age" | "yearsExp" | "hmlTeam" | "status";
type SortDir = "asc" | "desc";

function compareValues(
  a: PlayerRow,
  b: PlayerRow,
  key: SortKey,
  dir: SortDir
): number {
  let cmp = 0;

  switch (key) {
    case "name":
      cmp = (a.fullName ?? "").localeCompare(b.fullName ?? "");
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

const INJURY_LABELS: Record<string, string> = {
  Out: "OUT",
  Doubtful: "DOUBTFUL",
  Questionable: "Q",
  IR: "IR",
  PUP: "PUP",
  Suspended: "SUSP",
  NFI: "NFI",
  COV: "COVID",
};

// Injury statuses that read as a clear negative (rust); "Questionable" reads
// as a caution rather than a hard negative, so it gets the gold treatment.
const NEGATIVE_INJURY_STATUSES = new Set([
  "Out",
  "Doubtful",
  "IR",
  "PUP",
  "Suspended",
  "NFI",
  "COV",
]);

function StatusIndicator({
  status,
  injuryStatus,
}: {
  status: string | null;
  injuryStatus: string | null;
}) {
  if (injuryStatus) {
    const label = INJURY_LABELS[injuryStatus] ?? injuryStatus.toUpperCase();
    const isNegative = NEGATIVE_INJURY_STATUSES.has(injuryStatus);

    return (
      <span
        className={`inline-block text-caption px-2 py-0.5 rounded-full ${
          isNegative
            ? "text-accent-warm bg-accent-warm-light"
            : "text-accent-gold bg-accent-gold-light"
        }`}
      >
        {label}
      </span>
    );
  }

  if (status && status !== "Active") {
    return (
      <span className="inline-block text-caption px-2 py-0.5 rounded-full text-text-tertiary bg-surface-muted">
        {status}
      </span>
    );
  }

  return <span className="text-body-sm text-text-tertiary">&ndash;</span>;
}

/**
 * Small trending-adds marker: an up-arrow glyph plus the raw add count, so
 * the signal never rests on color alone. Renders a plain dash for players
 * outside the trending list.
 */
function TrendingSignal({ count }: { count: number | null }) {
  if (count == null) {
    return <span className="text-body-sm text-text-tertiary">-</span>;
  }

  return (
    <span
      className="inline-flex items-center justify-end gap-1 text-caption font-mono font-semibold text-accent-green"
      title={`${count} adds in the last 24 hours`}
    >
      <ArrowUp className="size-3" aria-hidden="true" />
      {count}
    </span>
  );
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
      className={`pb-3 pr-4 text-caption text-text-tertiary cursor-pointer select-none hover:text-text-primary transition-colors ${align === "right" ? "text-right" : "text-left"}`}
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
  players: PlayerRow[];
  franchises: { id: string; name: string; slug: string }[];
  statsSeason: number | null;
  initialQuery?: string;
  /** Whether to render the PROJ column: false when no rows have a projection (no sync yet / offseason). */
  showProjColumn?: boolean;
  /** Whether to render the TRD column: false when the trending-adds list is empty. */
  showTrdColumn?: boolean;
}

export function PlayerTable({
  players,
  franchises,
  statsSeason,
  initialQuery = "",
  showProjColumn = false,
  showTrdColumn = false,
}: PlayerTableProps) {
  const [search, setSearch] = useState(initialQuery);
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

  return (
    <div className="mt-8 space-y-6">
      {/* Filter row: position pills + search + roster select */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={posFilter}
          onValueChange={(value) => setPosFilter(value as PositionFilter)}
        >
          <TabsList aria-label="Position filter">
            {POSITIONS.map((pos) => (
              <TabsTrigger key={pos} value={pos}>
                {pos}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
              aria-hidden="true"
            />
            <label htmlFor="player-filter" className="sr-only">
              Search players
            </label>
            <Input
              id="player-filter"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players, NFL teams, or HMLML teams..."
              autoComplete="off"
              className="h-8 rounded-full pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="roster-filter" className="sr-only">
              Roster
            </label>
            <Select
              value={rosterFilter}
              onValueChange={(value) => setRosterFilter(value as RosterFilter)}
            >
              <SelectTrigger id="roster-filter" className="rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FA">Free Agents</SelectItem>
                <SelectItem value="ALL">All Players</SelectItem>
                <SelectGroup>
                  <SelectLabel>Teams</SelectLabel>
                  {franchises.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Result count */}
      <p className="text-body-sm text-text-tertiary">
        <span className="text-stat text-text-primary">{filtered.length}</span>{" "}
        of <span className="text-stat text-text-primary">{players.length}</span>{" "}
        players
      </p>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-divider">
              <SortHeader
                label="Player"
                sortKey="name"
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
              {showProjColumn && (
                <th className="pb-3 pr-4 text-right text-caption text-text-tertiary">
                  Proj
                </th>
              )}
              <SortHeader
                label="Age"
                sortKey="age"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortHeader
                label="Exp"
                sortKey="yearsExp"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                align="right"
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
              {showTrdColumn && (
                <th className="pb-3 pr-4 text-right text-caption text-text-tertiary">
                  Trd
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((player) => (
              <tr
                key={player.id}
                className="border-b border-divider last:border-0 hover:bg-surface transition-colors"
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <PlayerHeadshot
                      playerId={player.id}
                      name={player.fullName ?? "Unknown"}
                      size={28}
                      nflTeam={player.nflTeam}
                    />
                    <div className="min-w-0">
                      <p className="text-body font-medium text-text-primary truncate">
                        {player.fullName ?? "Unknown"}
                      </p>
                      <p className="text-body-sm text-text-tertiary">
                        {player.nflTeam ?? "FA"} &middot; {player.position ?? "-"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-4 text-right">
                  <span className="text-stat text-text-primary">
                    {player.pointsPpr != null
                      ? player.pointsPpr.toFixed(1)
                      : "-"}
                  </span>
                </td>
                {showProjColumn && (
                  <td className="py-3 pr-4 text-right">
                    <span className="text-stat font-mono text-text-tertiary">
                      {player.projPoints != null
                        ? player.projPoints.toFixed(1)
                        : "-"}
                    </span>
                  </td>
                )}
                <td className="py-3 pr-4 text-right">
                  <span className="text-stat text-text-secondary">
                    {player.age ?? "-"}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right">
                  <span className="text-stat text-text-secondary">
                    {player.yearsExp != null ? player.yearsExp : "-"}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  {player.ownerFranchiseSlug && player.ownerFranchiseName ? (
                    <Link
                      href={`/teams/${player.ownerFranchiseSlug}`}
                      className="text-body-sm font-medium text-accent-gold hover:brightness-110"
                    >
                      {player.ownerFranchiseName}
                    </Link>
                  ) : (
                    <span className="text-body-sm text-text-tertiary italic">
                      Free Agent
                    </span>
                  )}
                </td>
                <td className="py-3">
                  <StatusIndicator
                    status={player.status}
                    injuryStatus={player.injuryStatus}
                  />
                </td>
                {showTrdColumn && (
                  <td className="py-3 pr-4 text-right">
                    <TrendingSignal count={player.trendingCount} />
                  </td>
                )}
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
            className="rounded-2xl border border-border bg-surface p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <PlayerHeadshot
                  playerId={player.id}
                  name={player.fullName ?? "Unknown"}
                  size={32}
                  nflTeam={player.nflTeam}
                />
                <div className="min-w-0">
                  <p className="text-body font-medium text-text-primary truncate">
                    {player.fullName ?? "Unknown"}
                  </p>
                  <p className="text-body-sm text-text-tertiary">
                    {player.nflTeam ?? "FA"} &middot; {player.position ?? "-"}
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-stat text-text-primary">
                  {player.pointsPpr != null ? player.pointsPpr.toFixed(1) : "-"}
                </p>
                <StatusIndicator
                  status={player.status}
                  injuryStatus={player.injuryStatus}
                />
              </div>
            </div>
            {(showProjColumn || (showTrdColumn && player.trendingCount != null)) && (
              <div className="flex items-center gap-4 text-body-sm">
                {showProjColumn && (
                  <span className="text-text-tertiary">
                    PROJ{" "}
                    <span className="text-stat font-mono text-text-tertiary">
                      {player.projPoints != null
                        ? player.projPoints.toFixed(1)
                        : "-"}
                    </span>
                  </span>
                )}
                {showTrdColumn && player.trendingCount != null && (
                  <TrendingSignal count={player.trendingCount} />
                )}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-divider pt-2 text-body-sm">
              <span className="text-text-tertiary">HMLML Team</span>
              {player.ownerFranchiseSlug && player.ownerFranchiseName ? (
                <Link
                  href={`/teams/${player.ownerFranchiseSlug}`}
                  className="font-medium text-accent-gold hover:brightness-110"
                >
                  {player.ownerFranchiseName}
                </Link>
              ) : (
                <span className="text-text-tertiary italic">Free Agent</span>
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
