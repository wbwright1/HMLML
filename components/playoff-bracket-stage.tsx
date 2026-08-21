import type { CSSProperties } from "react";
import { ordinal, type BracketType } from "@/lib/playoff-bracket";
import type { BracketRound } from "@/lib/queries/playoff-bracket";
import {
  buildBracketStage,
  getPlacementColumn,
  type BracketConnector,
} from "@/lib/playoff-bracket-layout";
import {
  BracketCell,
  BracketPlacementCell,
} from "@/components/playoff-bracket-cell";
import {
  getBracketOutcomeColumnLabel,
  getBracketSwipeHint,
  TOILET_BOWL_COPY,
} from "@/lib/playoff-labels";
import { getBowlName } from "@/lib/bowl-names";

/**
 * The bracket stage: rounds as columns, cells converging through hairline
 * elbow connectors, the champion's road traced over the top, and a champion
 * capsule at the end of it. Server component, zero client JS: the horizontal
 * scroll is native overflow, the edge fade is a gradient, the road is markup.
 *
 * Geometry comes from lib/playoff-bracket-layout.ts in index space; every
 * position below is a calc() over the stage's CSS custom properties, which one
 * media query in globals.css re-points from the mobile scale to the desktop
 * scale. DOM order stays round by round, team1 then team2, for screen readers.
 */

interface PlayoffBracketStageProps {
  rounds: BracketRound[];
  bracketType: BracketType;
  seasonYear: number;
  totalRosters: number | null;
}

// --- index space -> pixels -------------------------------------------------

/** Left edge of a column. */
function colLeft(column: number): string {
  return `calc(var(--bk-col) * ${column})`;
}

/** Top edge of a cell at these row units. */
function cellTop(units: number): string {
  return `calc(var(--bk-head) + var(--bk-pitch) * ${units})`;
}

/** Vertical center of a cell at these row units. */
function cellCenter(units: number): string {
  return `calc(var(--bk-head) + var(--bk-pitch) * ${units} + var(--bk-cell-h) / 2)`;
}

function connectorStyle(connector: BracketConnector): CSSProperties {
  const gutter = `calc(${colLeft(connector.column)} + var(--bk-cell-w))`;
  if (connector.orientation === "v") {
    return {
      left: `calc(${gutter} + var(--bk-stub))`,
      top: cellCenter(connector.fromUnits),
      height: `calc(var(--bk-pitch) * ${connector.toUnits - connector.fromUnits})`,
    };
  }
  if (connector.segment === "capsule") {
    return {
      left: gutter,
      top: cellCenter(connector.fromUnits),
      width: "calc(var(--bk-stub) * 2)",
    };
  }
  return {
    left:
      connector.segment === "in"
        ? `calc(${gutter} + var(--bk-stub))`
        : gutter,
    top: cellCenter(connector.fromUnits),
    width: "var(--bk-stub)",
  };
}

// --- component -------------------------------------------------------------

export function PlayoffBracketStage({
  rounds,
  bracketType,
  seasonYear,
  totalRosters,
}: PlayoffBracketStageProps) {
  if (rounds.length === 0) return null;

  const stage = buildBracketStage(rounds);
  const isToiletBowl = bracketType === "losers";
  const bowlName = getBowlName(seasonYear);

  return (
    <div
      data-testid={`bracket-${bracketType}`}
      className="bracket-root space-y-3"
    >
      <p className="text-[9.5px] font-semibold uppercase tracking-[.12em] text-text-tertiary lg:hidden">
        {getBracketSwipeHint(bracketType)}
      </p>

      <div className="relative">
        <div className="bracket-track">
          <div
            className="bracket-stage"
            style={
              {
                "--bk-cols": stage.columnCount,
                "--bk-slots": stage.slotCount,
              } as CSSProperties
            }
          >
            {/* Column heads */}
            {stage.columns.map((column, index) => (
              <div
                key={`head-${column.round}`}
                className="bracket-colhead"
                style={{ left: colLeft(index) }}
              >
                <b>{column.label}</b>
                {column.week != null && (
                  <>
                    {" · "}
                    <span className="font-mono">WK {column.week}</span>
                  </>
                )}
              </div>
            ))}
            {stage.hasCapsule && (
              <div
                className={`bracket-colhead ${
                  isToiletBowl ? "text-accent-warm" : "text-accent-gold"
                }`}
                style={{ left: colLeft(stage.columnCount) }}
              >
                {getBracketOutcomeColumnLabel(bracketType, bowlName)}
              </div>
            )}

            {/* Connectors, decorative: the DOM tells the same story in order. */}
            {stage.connectors.map((connector) => (
              <div
                key={connector.key}
                aria-hidden="true"
                className="bracket-line"
                data-orientation={connector.orientation}
                data-road={connector.onRoad ? bracketType : undefined}
                style={connectorStyle(connector)}
              />
            ))}

            {/* Cells, in walk order (round by round, feeder before parent). */}
            {stage.cells.map((cell) => (
              <BracketCell
                key={cell.key}
                cell={cell}
                bracketType={bracketType}
                seasonYear={seasonYear}
                style={{
                  left: colLeft(cell.column),
                  top: cellTop(cell.topUnits),
                }}
              />
            ))}

            {/* The end of the road. */}
            {stage.hasCapsule && stage.champion && (
              <div
                data-testid={`bracket-capsule-${bracketType}`}
                className="bracket-capsule"
                data-tone={isToiletBowl ? "losers" : undefined}
                style={{
                  left: colLeft(stage.columnCount),
                  top: `calc(${cellCenter(
                    stage.cells.find((c) => c.isFinal)?.topUnits ?? 0,
                  )} - var(--bk-cap-h) / 2)`,
                }}
              >
                <p
                  className={`text-[8px] font-bold uppercase tracking-[.14em] lg:text-[9.5px] lg:tracking-[.16em] ${
                    isToiletBowl ? "text-accent-warm" : "text-accent-gold"
                  }`}
                >
                  {isToiletBowl
                    ? TOILET_BOWL_COPY.championKicker
                    : `${seasonYear} Champion`}
                </p>
                <p className="font-serif text-[16px] italic leading-[1.15] text-text-primary lg:text-[21px]">
                  {stage.champion.franchiseName}
                </p>
                <p className="text-[9.5px] text-text-tertiary lg:text-[11px]">
                  {isToiletBowl ? (
                    <>
                      {totalRosters != null && (
                        <>
                          <span className="font-mono">
                            {ordinal(totalRosters)} of {totalRosters}
                          </span>
                          {" · "}
                        </>
                      )}
                      <span className="font-mono font-bold text-text-secondary">
                        {stage.champion.points?.toFixed(2) ?? "–"}
                      </span>{" "}
                      in the final
                    </>
                  ) : (
                    <>
                      {bowlName && <>{bowlName} · </>}
                      <span className="font-mono font-bold text-text-secondary">
                        {stage.champion.points?.toFixed(2) ?? "–"}
                        {"–"}
                        {stage.runnerUp?.points?.toFixed(2) ?? "–"}
                      </span>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
        {/* Canvas-colored right-edge fade: the track scrolls, the page does not. */}
        <div className="bracket-fade lg:hidden" aria-hidden="true" />
      </div>

      {/* Placement games: they decide where somebody finished, not who moves
          on, so they live in their own lane rather than in the columns. */}
      {stage.placementMatches.length > 0 && (
        <div
          data-testid={`bracket-placement-lane-${bracketType}`}
          className="pt-4"
        >
          <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-text-tertiary mb-2 lg:text-[10px] lg:tracking-[.16em]">
            Placement Games
          </p>
          <div
            className="bracket-lane"
            style={
              { "--bk-cols": stage.columnCount } as CSSProperties
            }
          >
            {stage.placementMatches.map((match) => (
              <div
                key={`placement-${match.matchNumber}`}
                style={{
                  gridColumn: getPlacementColumn(stage, match) + 1,
                  gridRow: 1,
                }}
              >
                <BracketPlacementCell
                  match={match}
                  bracketType={bracketType}
                  seasonYear={seasonYear}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
