import { PlayerHeadshot } from "@/components/player-headshot";
import { NflTeamLogo } from "@/components/nfl-team-logo";
import { PositionBadge } from "@/components/position-badge";
import type { MatchupTeam } from "@/lib/queries/matchups";
import type { LineupRow, LineupSide, MatchupLineups as MatchupLineupsData } from "@/lib/queries/player-points";

interface MatchupLineupsProps {
  homeTeam: MatchupTeam;
  awayTeam: MatchupTeam;
  lineups: MatchupLineupsData;
  homeWins: boolean;
  awayWins: boolean;
}

function isDefenseRow(row: LineupRow): boolean {
  return (row.position ?? "").toUpperCase() === "DEF";
}

function sumPoints(rows: LineupRow[]): number {
  return rows.reduce((total, row) => total + row.points, 0);
}

function formatPoints(value: number): string {
  return value.toFixed(1);
}

function formatProjected(value: number | null): string {
  return value != null ? value.toFixed(1) : "—";
}

/**
 * Renders both rosters' starting lineups and bench for a matchup detail
 * page. Server component; the only client leaves are the headshot/logo
 * fallback components it composes.
 */
export function MatchupLineups({ homeTeam, awayTeam, lineups, homeWins, awayWins }: MatchupLineupsProps) {
  const homeSide = lineups.sides.find((side) => side.rosterId === homeTeam.rosterId);
  const awaySide = lineups.sides.find((side) => side.rosterId === awayTeam.rosterId);

  const homeHasData = !!homeSide && (homeSide.starters.length > 0 || homeSide.bench.length > 0);
  const awayHasData = !!awaySide && (awaySide.starters.length > 0 || awaySide.bench.length > 0);

  if (!homeHasData || !awayHasData) {
    return (
      <p className="mt-8 text-body-sm text-text-tertiary text-center">
        Per-player lineups aren&apos;t available for this matchup.
      </p>
    );
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-2">
      <TeamLineupSection team={homeTeam} side={homeSide!} isWinner={homeWins} />
      <TeamLineupSection team={awayTeam} side={awaySide!} isWinner={awayWins} />
    </div>
  );
}

function TeamLineupSection({
  team,
  side,
  isWinner,
}: {
  team: MatchupTeam;
  side: LineupSide;
  isWinner: boolean;
}) {
  const startersTotal = sumPoints(side.starters);

  return (
    <section aria-label={`${team.franchiseName} lineup`} className="space-y-3">
      <h2
        className={`text-kicker ${isWinner ? "text-text-primary" : "text-text-tertiary"}`}
      >
        {team.franchiseName} &middot; Starters
      </h2>

      <div className="card-surface p-4 md:p-5">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-3 pr-3 text-left text-kicker">Slot</th>
                <th className="pb-3 pr-3 text-left text-kicker">Player</th>
                <th className="pb-3 pr-3 text-left text-kicker">Pos</th>
                <th className="pb-3 pr-3 text-left text-kicker">Team</th>
                <th className="pb-3 pr-3 text-right text-kicker">PTS</th>
                <th className="pb-3 text-right text-kicker">Proj</th>
              </tr>
            </thead>
            <tbody>
              {side.starters.map((row) => (
                <tr key={row.playerId} className="border-b border-divider last:border-0">
                  <td className="py-3 pr-3 text-caption text-text-tertiary whitespace-nowrap">
                    {row.slot}
                  </td>
                  <td className="py-3 pr-3">
                    <LineupPlayerCell row={row} />
                  </td>
                  <td className="py-3 pr-3">
                    <PositionBadge position={row.position} />
                  </td>
                  <td className="py-3 pr-3 text-body-sm text-text-secondary">
                    {row.nflTeam ?? "FA"}
                  </td>
                  <td className="py-3 pr-3 text-right text-stat text-text-primary">
                    {formatPoints(row.points)}
                  </td>
                  <td className="py-3 text-right text-stat font-normal text-text-tertiary">
                    {formatProjected(row.projectedPoints)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: stacked cards */}
        <div className="md:hidden space-y-2" role="list">
          {side.starters.map((row) => (
            <div
              key={row.playerId}
              className="flex items-center gap-3 rounded-[10px] border border-border bg-surface p-3"
              role="listitem"
            >
              <span className="w-10 shrink-0 text-caption text-text-tertiary">
                {row.slot}
              </span>
              <LineupPlayerCell row={row} className="min-w-0 flex-1" />
              <span className="shrink-0 text-stat text-text-primary">
                {formatPoints(row.points)}
              </span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="flex items-center justify-between border-t border-divider mt-3 pt-3">
          <span className="text-caption text-text-tertiary">Total</span>
          <div className="flex items-center gap-4">
            <span className="text-stat text-lg text-text-primary">
              {formatPoints(startersTotal)}
            </span>
            <span className="text-body-sm font-mono text-text-tertiary">
              Proj {formatProjected(side.totalProjected)}
            </span>
          </div>
        </div>
      </div>

      {side.bench.length > 0 && (
        <details className="card-surface p-4 md:p-5">
          <summary className="text-kicker cursor-pointer select-none">
            Bench ({side.bench.length})
          </summary>
          <div className="mt-3 space-y-2">
            {side.bench.map((row) => (
              <div key={row.playerId} className="flex items-center gap-3">
                <LineupPlayerCell row={row} className="min-w-0 flex-1" muted />
                <span className="shrink-0 text-stat font-normal text-text-tertiary">
                  {formatPoints(row.points)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function LineupPlayerCell({
  row,
  className = "",
  muted = false,
}: {
  row: LineupRow;
  className?: string;
  muted?: boolean;
}) {
  const name = row.name ?? "Unknown Player";
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {isDefenseRow(row) ? (
        <NflTeamLogo teamAbbrev={row.nflTeam} size={36} />
      ) : (
        <PlayerHeadshot playerId={row.playerId} name={name} size={36} nflTeam={row.nflTeam} />
      )}
      <span
        className={`truncate text-body-sm ${
          muted ? "text-text-tertiary" : "font-medium text-text-primary"
        }`}
      >
        {name}
      </span>
    </div>
  );
}
