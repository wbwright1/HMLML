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
import { FranchiseLogo } from "@/components/franchise-logo";
import { EmptyState } from "@/components/empty-state";
import { AwardChipRow, type AwardChipData } from "@/components/award-chip";
import { cn } from "@/lib/utils";
import type { RosteredPlayer } from "@/lib/queries/players";

/**
 * Inlined equivalent of components/player-link.tsx (a server component) for
 * use inside this client component. Same falsy-playerId fallback + hover
 * treatment; kept in lockstep by hand since it can't be imported here.
 */
function PlayerLink({
  playerId,
  children,
  className,
}: {
  playerId: string | null | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  if (!playerId) {
    return <>{children}</>;
  }

  return (
    <Link
      href={`/players/${playerId}`}
      prefetch={false}
      className={cn("transition-colors hover:text-accent-gold", className)}
    >
      {children}
    </Link>
  );
}

/**
 * A RosteredPlayer enriched with the merged in-season "this week" (WK) signal
 * and the trending-adds signal. `weekValue` is the number shown in the WK cell
 * (actual points once the player's game has started/finished, otherwise the
 * projection); `weekIsProjected` flags the projected case so the cell can show
 * a "~" prefix. Both default to null/false when the page has no week data for
 * that player. The table decides whether to show the WK/TRD columns at all via
 * showWkColumn / showTrdColumn, computed once in the page.
 */
export interface PlayerRow extends RosteredPlayer {
  weekValue: number | null;
  weekIsProjected: boolean;
  trendingCount: number | null;
}

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"] as const;
type PositionFilter = (typeof POSITIONS)[number];

type SortKey =
  | "name"
  | "points"
  | "seasonProj"
  | "week"
  | "age"
  | "yearsExp"
  | "hmlTeam"
  | "status";
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
    case "seasonProj":
      cmp = (a.projPointsPpr ?? 0) - (b.projPointsPpr ?? 0);
      break;
    case "week":
      cmp = (a.weekValue ?? 0) - (b.weekValue ?? 0);
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

// Compact base paddings so ~390px screens can render every column at a
// readable touch size; desktop relaxes back to the original spacing via `md:`.
const TH_PADDING = "px-2.5 py-2.5 md:px-0 md:pr-4 md:py-3";
const TD_PADDING = "px-2.5 py-2.5 md:px-0 md:pr-4 md:py-3";

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  /** Full text for the acronym label, exposed via aria-label + title. */
  fullText: string;
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  activeDir,
  onSort,
  align = "left",
  fullText,
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
      aria-label={fullText}
      title={fullText}
      className={`${TH_PADDING} text-caption text-text-tertiary cursor-pointer select-none hover:text-text-primary transition-colors ${align === "right" ? "text-right" : "text-left"}`}
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
  /** The season the season-long projection is for (e.g. 2026). */
  projSeason?: number | null;
  /**
   * Whether the season-long projection leads the table (headline PROJ column
   * first, last season's points de-emphasized second). Computed in the page
   * from the three-segment season model (lib/season-segment.ts): true only in
   * the PRESEASON segment (`segment === "preseason" && projSeason != null`),
   * i.e. after the rookie draft but before the NFL season starts. False in the
   * offseason (PTS leads) and in-season (the WK column leads instead).
   */
  projLeads?: boolean;
  /** Current NFL week (for the in-season WK column header); null outside the in-season segment. */
  currentWeek?: number | null;
  initialQuery?: string;
  /**
   * Whether to render the merged in-season "WK" column: false offseason or
   * before the current week's data has synced. Never true when projLeads.
   */
  showWkColumn?: boolean;
  /** Whether to render the TRD column: false when the trending-adds list is empty. */
  showTrdColumn?: boolean;
  /** League-award badges ("MVP '25") keyed by player id. Empty pre-seed. */
  awardsByPlayerId?: Record<string, AwardChipData[]>;
}

export function PlayerTable({
  players,
  franchises,
  statsSeason,
  projSeason = null,
  projLeads = false,
  currentWeek = null,
  initialQuery = "",
  showWkColumn = false,
  showTrdColumn = false,
  awardsByPlayerId = {},
}: PlayerTableProps) {
  const [search, setSearch] = useState(initialQuery);
  const [posFilter, setPosFilter] = useState<PositionFilter>("ALL");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("FA");
  // Headline column and default sort:
  //  - offseason (projLeads): the season-long projection leads.
  //  - in-season with week data: the merged "this week" (WK) column leads.
  //  - otherwise: the season point total leads.
  const [sortKey, setSortKey] = useState<SortKey>(
    projLeads ? "seasonProj" : showWkColumn ? "week" : "points"
  );
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        // Default to desc for the numeric headline columns, asc otherwise
        setSortDir(
          key === "points" || key === "seasonProj" || key === "week"
            ? "desc"
            : "asc"
        );
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

      {/*
        Always-visible, horizontally-scrolling table. This div is the sole
        horizontal scroll boundary (overflow-x-auto); the page body must
        never scroll horizontally. min-w on the table forces the overflow
        on narrow (~390px) screens rather than crushing columns.
        No will-change / transform anywhere in this subtree — a transformed
        ancestor silently breaks `position: sticky` (see PRs #150/#155/#156).
      */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-divider">
              <th
                className={`sticky left-0 z-[1] bg-canvas border-r border-divider max-w-[168px] md:max-w-none ${TH_PADDING} text-caption text-text-tertiary cursor-pointer select-none hover:text-text-primary transition-colors text-left`}
                role="button"
                tabIndex={0}
                onClick={() => handleSort("name")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSort("name");
                  }
                }}
                aria-sort={
                  sortKey === "name"
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
                aria-label="Player"
                title="Player"
              >
                <span className="inline-flex items-center gap-1">
                  Player
                  {sortKey === "name" ? (
                    sortDir === "asc" ? (
                      <ChevronUp className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )
                  ) : (
                    <span className="size-3" aria-hidden="true" />
                  )}
                </span>
              </th>
              {projLeads && (
                <SortHeader
                  label="PROJ"
                  fullText={
                    projSeason
                      ? `Projected ${projSeason} fantasy points`
                      : "Projected fantasy points"
                  }
                  sortKey="seasonProj"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
              )}
              {showWkColumn && (
                <SortHeader
                  label="WK"
                  fullText={
                    currentWeek
                      ? `Week ${currentWeek}: points if played, projected if not`
                      : "This week: points if played, projected if not"
                  }
                  sortKey="week"
                  activeKey={sortKey}
                  activeDir={sortDir}
                  onSort={handleSort}
                  align="right"
                />
              )}
              <SortHeader
                label="PTS"
                fullText={statsSeason ? `${statsSeason} fantasy points` : "Fantasy points"}
                sortKey="points"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortHeader
                label="AGE"
                fullText="Player age"
                sortKey="age"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortHeader
                label="EXP"
                fullText="Years of NFL experience"
                sortKey="yearsExp"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortHeader
                label="TM"
                fullText="HMLML team"
                sortKey="hmlTeam"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="INJ"
                fullText="Injury / roster status"
                sortKey="status"
                activeKey={sortKey}
                activeDir={sortDir}
                onSort={handleSort}
              />
              {showTrdColumn && (
                <th
                  className={`${TH_PADDING} text-right text-caption text-text-tertiary`}
                  aria-label="Trending adds, last 24h"
                  title="Trending adds, last 24h"
                >
                  TRD
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
                <td
                  className={`sticky left-0 z-[1] bg-canvas border-r border-divider max-w-[168px] md:max-w-none ${TD_PADDING}`}
                >
                  <PlayerLink playerId={player.id} className="flex items-center gap-2 md:gap-3">
                    <PlayerHeadshot
                      playerId={player.id}
                      name={player.fullName ?? "Unknown"}
                      size={32}
                      nflTeam={player.nflTeam}
                    />
                    <div className="min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <p className="text-body font-medium text-text-primary truncate">
                          {player.fullName ?? "Unknown"}
                        </p>
                        {/* Award chips add width the capped mobile column can't
                            spare; show them only from md up. */}
                        <span className="hidden md:flex">
                          <AwardChipRow awards={awardsByPlayerId[player.id] ?? []} />
                        </span>
                      </div>
                      <p className="text-body-sm text-text-tertiary">
                        {player.nflTeam ?? "FA"} &middot; {player.position ?? "-"}
                      </p>
                    </div>
                  </PlayerLink>
                </td>
                {projLeads && (
                  <td className={`${TD_PADDING} text-right`}>
                    <span className="text-stat text-text-primary">
                      {player.projPointsPpr != null
                        ? player.projPointsPpr.toFixed(1)
                        : "-"}
                    </span>
                  </td>
                )}
                {showWkColumn && (
                  <td className={`${TD_PADDING} text-right`}>
                    {player.weekValue == null ? (
                      <span className="text-stat text-text-tertiary">-</span>
                    ) : player.weekIsProjected ? (
                      <span
                        className="text-stat text-text-tertiary"
                        title="Projected, has not played yet"
                        aria-label={`Projected ${player.weekValue.toFixed(1)}, has not played yet`}
                      >
                        ~{player.weekValue.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-stat text-text-primary">
                        {player.weekValue.toFixed(1)}
                      </span>
                    )}
                  </td>
                )}
                <td className={`${TD_PADDING} text-right`}>
                  <span
                    className={cn(
                      "text-stat",
                      projLeads ? "text-text-tertiary" : "text-text-primary"
                    )}
                  >
                    {player.pointsPpr != null
                      ? player.pointsPpr.toFixed(1)
                      : "-"}
                  </span>
                </td>
                <td className={`${TD_PADDING} text-right`}>
                  <span className="text-stat text-text-secondary">
                    {player.age ?? "-"}
                  </span>
                </td>
                <td className={`${TD_PADDING} text-right`}>
                  <span className="text-stat text-text-secondary">
                    {player.yearsExp != null ? player.yearsExp : "-"}
                  </span>
                </td>
                <td className={TD_PADDING}>
                  {player.ownerFranchiseSlug && player.ownerFranchiseName ? (
                    <Link
                      href={`/teams/${player.ownerFranchiseSlug}`}
                      title={player.ownerFranchiseName}
                      className="inline-flex items-center hover:brightness-110"
                    >
                      <FranchiseLogo
                        slug={player.ownerFranchiseSlug}
                        name={player.ownerFranchiseName}
                        abbreviation={player.ownerFranchiseAbbrev ?? undefined}
                        brandingColor={player.ownerFranchiseBrandingColor ?? undefined}
                        avatarUrl={player.ownerFranchiseAvatarUrl}
                        size={28}
                      />
                    </Link>
                  ) : (
                    <span className="text-caption text-text-tertiary italic">
                      FA
                    </span>
                  )}
                </td>
                <td className={TD_PADDING}>
                  <StatusIndicator
                    status={player.status}
                    injuryStatus={player.injuryStatus}
                  />
                </td>
                {showTrdColumn && (
                  <td className={`${TD_PADDING} text-right`}>
                    <TrendingSignal count={player.trendingCount} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
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
