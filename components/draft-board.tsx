import Link from "next/link";
import { getPositionColor } from "@/lib/position-colors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftBoardTeam {
  franchiseId: string;
  franchiseName: string | null;
  franchiseAbbreviation: string | null;
  franchiseBrandingColor: string | null;
  franchiseSlug: string | null;
  draftPosition: number;
}

export interface DraftBoardCell {
  pickNumber: number;
  roundPickNumber: string; // formatted as "R.PP"
  playerName: string | null;
  playerPosition: string | null;
  franchiseId: string | null;
  isEmpty: boolean;
}

export interface DraftBoardRound {
  roundNumber: number;
  cells: DraftBoardCell[]; // in left-to-right display order
}

export interface DraftBoardProps {
  teams: DraftBoardTeam[];
  rounds: DraftBoardRound[];
  totalTeams: number;
  isUpcoming: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getLastName(fullName: string | null): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function getTeamLabel(team: DraftBoardTeam): string {
  if (team.franchiseAbbreviation) return team.franchiseAbbreviation;
  if (team.franchiseName) return team.franchiseName.slice(0, 3).toUpperCase();
  return "???";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DraftBoard({
  teams,
  rounds,
  totalTeams,
  isUpcoming,
}: DraftBoardProps) {
  const gridTemplateColumns = `48px repeat(${totalTeams}, minmax(88px, 1fr))`;

  return (
    <div className="overflow-x-auto">
      <div
        role="grid"
        aria-label={`Draft Board`}
        style={{
          display: "grid",
          gridTemplateColumns,
          minWidth: `${48 + totalTeams * 88}px`,
        }}
      >
        {/* Header row */}
        {/* Corner cell */}
        <div
          className="sticky left-0 z-15"
          style={{
            height: 64,
            background: "var(--surface)",
            borderBottom: "1px solid var(--border)",
            zIndex: 15,
          }}
        />

        {/* Team header cells */}
        {teams.map((team) => {
          const label = getTeamLabel(team);
          const borderColor =
            team.franchiseBrandingColor || "var(--border-strong)";

          const content = (
            <span
              className="text-[12px] font-medium uppercase tracking-[0.06em]"
              style={{ color: "var(--text-primary)" }}
            >
              {label}
            </span>
          );

          return (
            <div
              key={team.franchiseId}
              role="columnheader"
              style={{
                height: 64,
                borderTop: `3px solid ${borderColor}`,
                background: "var(--surface)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
              }}
            >
              {team.franchiseSlug ? (
                <Link
                  href={`/teams/${team.franchiseSlug}`}
                  className="hover:opacity-80 transition-opacity focus:outline-2 focus:outline-offset-2"
                  style={{ outlineColor: "var(--accent-green)" }}
                >
                  {content}
                </Link>
              ) : (
                content
              )}
            </div>
          );
        })}

        {/* Round rows */}
        {rounds.map((round) => (
          <RoundRow
            key={round.roundNumber}
            round={round}
            teams={teams}
            isUpcoming={isUpcoming}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round Row (fragment rendering round label + cells)
// ---------------------------------------------------------------------------

function RoundRow({
  round,
  teams,
  isUpcoming,
}: {
  round: DraftBoardRound;
  teams: DraftBoardTeam[];
  isUpcoming: boolean;
}) {
  return (
    <>
      {/* Round label cell */}
      <div
        role="rowheader"
        className="sticky left-0"
        style={{
          height: 68,
          width: 48,
          background: "var(--canvas)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 5,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          className="text-[12px] font-medium uppercase tracking-[0.06em]"
          style={{ color: "var(--text-tertiary)" }}
        >
          R{round.roundNumber}
        </span>
      </div>

      {/* Pick cells */}
      {round.cells.map((cell, idx) => (
        <PickCell
          key={`${round.roundNumber}-${idx}`}
          cell={cell}
          team={teams[idx] ?? null}
          isUpcoming={isUpcoming}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Pick Cell
// ---------------------------------------------------------------------------

function PickCell({
  cell,
  team,
  isUpcoming,
}: {
  cell: DraftBoardCell;
  team: DraftBoardTeam | null;
  isUpcoming: boolean;
}) {
  if (cell.isEmpty || isUpcoming) {
    return (
      <div
        role="gridcell"
        aria-label={`Pick ${cell.roundPickNumber}: upcoming`}
        style={{
          height: 68,
          background: "var(--surface-muted)",
          border: "1px solid var(--border)",
          padding: "6px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflow: "hidden",
        }}
      >
        <span
          className="text-[12px] tabular-nums"
          style={{ color: "var(--text-tertiary)" }}
        >
          {cell.roundPickNumber}
        </span>
        <span
          className="text-[14px]"
          style={{ color: "var(--text-muted)" }}
        >
          TBD
        </span>
      </div>
    );
  }

  const posColor = getPositionColor(cell.playerPosition);
  const lastName = getLastName(cell.playerName);
  const teamName = team?.franchiseName ?? "Unknown";

  return (
    <div
      role="gridcell"
      aria-label={`Pick ${cell.roundPickNumber}: ${cell.playerName ?? "Unknown"}, ${cell.playerPosition ?? "Unknown"}, ${teamName}`}
      style={{
        height: 68,
        backgroundColor: posColor.cell.bg,
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "6px 6px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        overflow: "hidden",
      }}
    >
      <span
        className="text-[12px] tabular-nums"
        style={{ color: "#FFFFFF" }}
      >
        {cell.roundPickNumber}
      </span>
      <span
        className="text-[14px] font-semibold truncate"
        style={{ color: "#FFFFFF" }}
      >
        {lastName || "Unknown"}
      </span>
      <span
        className="text-[12px] font-medium uppercase"
        style={{ color: "#FFFFFF" }}
      >
        {cell.playerPosition ?? ""}
      </span>
    </div>
  );
}
