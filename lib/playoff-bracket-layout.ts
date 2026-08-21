// Pure bracket geometry: turns the rendered rounds from
// lib/queries/playoff-bracket.ts into a stage description in INDEX SPACE
// (column index + fractional row units), never pixels. The components convert
// index space to pixels with calc() over five CSS custom properties, which is
// what lets one server-rendered markup tree carry both the mobile and the
// desktop scale with zero client JS.
//
// No database, no React, no DOM. Every hard case (byes, orphan matches, an
// undecided final, road tracing through a bye) is provable in the co-located
// unit tests without a browser.
//
// THE INVERSION: the road trace is derived from which team is flagged
// `advanced` (which comes from the stored advancing_roster_id), never from
// comparing points. In the Toilet Bowl the traced road therefore belongs to
// the team that kept losing, which is exactly right.

import type {
  BracketMatchView,
  BracketRound,
  BracketTeam,
} from "@/lib/queries/playoff-bracket";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BracketCellKind = "match" | "bye" | "tbd";

export interface BracketCellPlacement {
  /** Stable React key, e.g. "winners-m3" / "winners-bye-m3-s1". */
  key: string;
  kind: BracketCellKind;
  /** 0-based round column. */
  column: number;
  /**
   * Vertical position as a multiple of the row pitch. Integral for round-1
   * slots, fractional (0.5, 1.5, ...) for cells centered over their feeders.
   */
  topUnits: number;
  /** Set for kind === "match". */
  match: BracketMatchView | null;
  /** Set for kind === "bye": the team that sat the round out. */
  byeTeam: BracketTeam | null;
  /** Set for kind === "tbd": the match number that will fill this slot. */
  fromMatch: number | null;
  /** True for the placement-1 final (gold/rust ring). */
  isFinal: boolean;
}

export type ConnectorSegment = "out" | "in" | "capsule";

export interface BracketConnector {
  key: string;
  orientation: "h" | "v";
  /**
   * The column the segment starts from. Horizontal segments hang off the right
   * edge of this column; the vertical join sits in the gutter to its right.
   */
  column: number;
  /** Row units of the start point (cell center). */
  fromUnits: number;
  /** Row units of the end point; vertical segments only. */
  toUnits: number;
  /** Horizontal segments only: which of the three stub positions this is. */
  segment: ConnectorSegment;
  /** True for the gold (winners) / rust (Toilet Bowl) road overlay. */
  onRoad: boolean;
}

export interface BracketColumn {
  round: number;
  label: string;
  week: number | null;
}

export interface BracketStage {
  columns: BracketColumn[];
  cells: BracketCellPlacement[];
  connectors: BracketConnector[];
  /** The placement-1 match, when the bracket has one. */
  finalMatch: BracketMatchView | null;
  /** placement != null, excluding the final. Rendered in the placement lane. */
  placementMatches: BracketMatchView[];
  columnCount: number;
  /** Number of round-1 slots; drives the stage height. */
  slotCount: number;
  /** True when the final is decided, so a champion capsule can render. */
  hasCapsule: boolean;
  /** The team that won (or, in the Toilet Bowl, sank), when decided. */
  champion: BracketTeam | null;
  /** The other side of the final, when decided. */
  runnerUp: BracketTeam | null;
}

const EMPTY_STAGE: BracketStage = {
  columns: [],
  cells: [],
  connectors: [],
  finalMatch: null,
  placementMatches: [],
  columnCount: 0,
  slotCount: 0,
  hasCapsule: false,
  champion: null,
  runnerUp: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The team a match sent onward, read from the stored advancement flag. */
export function getAdvancingTeam(match: BracketMatchView): BracketTeam | null {
  if (!match.decided) return null;
  if (match.team1?.advanced) return match.team1;
  if (match.team2?.advanced) return match.team2;
  return null;
}

/** The other side of a decided match. */
export function getEliminatedTeam(match: BracketMatchView): BracketTeam | null {
  if (!match.decided) return null;
  if (match.team1?.advanced) return match.team2;
  if (match.team2?.advanced) return match.team1;
  return null;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Builds the stage for one side of the bracket by walking back from the final,
 * so feeder pairs land adjacent and connectors never cross. Each side of a
 * match resolves to the match that fed it (the stored feeder reference when
 * there is one, otherwise the earlier-round match that team advanced out of),
 * to a pass-through bye cell when the team played no earlier round, or to a
 * TBD placeholder when the slot is not filled yet.
 */
export function buildBracketStage(rounds: BracketRound[]): BracketStage {
  if (rounds.length === 0) return EMPTY_STAGE;

  const columns: BracketColumn[] = rounds.map((round) => ({
    round: round.round,
    label: round.label,
    week: round.week,
  }));
  const columnCount = columns.length;
  const columnIndexByRound = new Map<number, number>();
  rounds.forEach((round, index) => columnIndexByRound.set(round.round, index));

  const allMatches = rounds.flatMap((round) => round.matches);
  const matchByNumber = new Map<number, BracketMatchView>();
  for (const match of allMatches) matchByNumber.set(match.matchNumber, match);

  // The final: the placement-1 match, falling back to the sole match in the
  // last round when the season stored no placements.
  const lastRound = rounds[rounds.length - 1];
  const finalMatch =
    allMatches.find((m) => m.placement === 1) ??
    (lastRound.matches.length === 1 ? lastRound.matches[0] : null);

  // Placement games leave the columns entirely and live in their own lane.
  const placementMatches = allMatches
    .filter((m) => m.placement != null && m !== finalMatch)
    // Play order: the round they happened in, then the place they decided, so
    // the lane reads the same way the bracket above it does.
    .sort((a, b) => a.round - b.round || (a.placement ?? 0) - (b.placement ?? 0));
  const placementNumbers = new Set(placementMatches.map((m) => m.matchNumber));

  const cells: BracketCellPlacement[] = [];
  const connectors: BracketConnector[] = [];
  const visited = new Set<number>();
  let nextSlot = 0;

  const prefix = rounds[0]?.matches[0]?.bracketType ?? "winners";

  /** Every feeder -> destination link, kept so the road can be traced after. */
  interface Edge {
    childColumn: number;
    childUnits: number;
    parentUnits: number;
    /** The roster that came out of the child cell (advanced, or the bye team). */
    outRosterId: number | null;
    keyBase: string;
  }
  const edges: Edge[] = [];

  function columnOf(match: BracketMatchView): number {
    return columnIndexByRound.get(match.round) ?? Math.max(match.round - 1, 0);
  }

  /**
   * Which match sent this roster into a given round. Sleeper only keeps the
   * `t1_from`/`t2_from` feeder reference while the slot is still unresolved:
   * once the game is played the stored row carries the roster id and a NULL
   * feeder, so the explicit reference alone would turn every played round into
   * a wall of "byes". The advancing roster is the real link, and it is the
   * same stored column the rest of this module trusts, so the Toilet Bowl's
   * inversion is carried along for free.
   */
  function findFeeder(
    rosterId: number,
    beforeRound: number,
  ): BracketMatchView | undefined {
    let best: BracketMatchView | undefined;
    for (const candidate of allMatches) {
      if (candidate.round >= beforeRound) continue;
      if (visited.has(candidate.matchNumber)) continue;
      if (placementNumbers.has(candidate.matchNumber)) continue;
      if (getAdvancingTeam(candidate)?.rosterId !== rosterId) continue;
      // The nearest previous round wins: a team can appear in several.
      if (!best || candidate.round > best.round) best = candidate;
    }
    return best;
  }

  /** Places a match and everything feeding it; returns its row units. */
  function place(match: BracketMatchView): number {
    visited.add(match.matchNumber);
    const column = columnOf(match);

    // Round-1 (leftmost column) matches are leaves: they take the next slot.
    if (column <= 0) {
      const units = nextSlot++;
      cells.push({
        key: `${prefix}-m${match.matchNumber}`,
        kind: "match",
        column: 0,
        topUnits: units,
        match,
        byeTeam: null,
        fromMatch: null,
        isFinal: match === finalMatch,
      });
      return units;
    }

    const childUnits: number[] = [];
    const sides: {
      team: BracketTeam | null;
      fromMatch: number | null;
      side: 1 | 2;
    }[] = [
      { team: match.team1, fromMatch: match.team1FromMatch, side: 1 },
      { team: match.team2, fromMatch: match.team2FromMatch, side: 2 },
    ];

    for (const { team, fromMatch, side } of sides) {
      const explicitFeeder =
        fromMatch != null && !visited.has(fromMatch)
          ? matchByNumber.get(fromMatch)
          : undefined;
      const feeder =
        explicitFeeder && !placementNumbers.has(explicitFeeder.matchNumber)
          ? explicitFeeder
          : team
            ? findFeeder(team.rosterId, match.round)
            : undefined;

      if (feeder) {
        const units = place(feeder);
        childUnits.push(units);
        edges.push({
          childColumn: columnOf(feeder),
          childUnits: units,
          parentUnits: 0, // filled in below, once the parent is centered
          outRosterId: getAdvancingTeam(feeder)?.rosterId ?? null,
          keyBase: `${prefix}-m${match.matchNumber}-s${side}`,
        });
        continue;
      }

      // No feeder match. A named team here sat the round out (a first-round
      // bye); an empty slot is a genuinely unknown future occupant.
      const units = nextSlot++;
      const byeColumn = column - 1;
      cells.push({
        key: `${prefix}-${team ? "bye" : "tbd"}-m${match.matchNumber}-s${side}`,
        kind: team ? "bye" : "tbd",
        column: byeColumn,
        topUnits: units,
        match: null,
        byeTeam: team,
        fromMatch: fromMatch ?? null,
        isFinal: false,
      });
      childUnits.push(units);
      edges.push({
        childColumn: byeColumn,
        childUnits: units,
        parentUnits: 0,
        outRosterId: team?.rosterId ?? null,
        keyBase: `${prefix}-m${match.matchNumber}-s${side}`,
      });
    }

    const units =
      childUnits.length > 0
        ? childUnits.reduce((sum, u) => sum + u, 0) / childUnits.length
        : nextSlot++;

    cells.push({
      key: `${prefix}-m${match.matchNumber}`,
      kind: "match",
      column,
      topUnits: units,
      match,
      byeTeam: null,
      fromMatch: null,
      isFinal: match === finalMatch,
    });

    // Back-fill the destination row units on the edges just created.
    for (const edge of edges) {
      if (edge.keyBase.startsWith(`${prefix}-m${match.matchNumber}-s`)) {
        edge.parentUnits = units;
      }
    }

    return units;
  }

  if (finalMatch) place(finalMatch);

  // Robustness: a match the walk never reached (malformed feeder data, or a
  // bracket shape we have not seen) is appended below the tree in its own
  // column rather than silently dropped.
  for (const match of allMatches) {
    if (visited.has(match.matchNumber)) continue;
    if (placementNumbers.has(match.matchNumber)) continue;
    cells.push({
      key: `${prefix}-m${match.matchNumber}`,
      kind: "match",
      column: columnOf(match),
      topUnits: nextSlot++,
      match,
      byeTeam: null,
      fromMatch: null,
      isFinal: match === finalMatch,
    });
  }

  // -------------------------------------------------------------------------
  // Connectors + the road
  // -------------------------------------------------------------------------

  const champion = finalMatch ? getAdvancingTeam(finalMatch) : null;
  const runnerUp = finalMatch ? getEliminatedTeam(finalMatch) : null;
  const championRosterId = champion?.rosterId ?? null;

  for (const edge of edges) {
    const { childColumn, childUnits, parentUnits, keyBase } = edge;
    connectors.push(
      {
        key: `${keyBase}-out`,
        orientation: "h",
        column: childColumn,
        fromUnits: childUnits,
        toUnits: childUnits,
        segment: "out",
        onRoad: false,
      },
      {
        key: `${keyBase}-join`,
        orientation: "v",
        column: childColumn,
        fromUnits: Math.min(childUnits, parentUnits),
        toUnits: Math.max(childUnits, parentUnits),
        segment: "out",
        onRoad: false,
      },
      {
        key: `${keyBase}-in`,
        orientation: "h",
        column: childColumn,
        fromUnits: parentUnits,
        toUnits: parentUnits,
        segment: "in",
        onRoad: false,
      },
    );

    // The road: only the exact path the champion (or sinker) travelled, and
    // only ever from the stored advancement, never from the scores.
    if (championRosterId != null && edge.outRosterId === championRosterId) {
      connectors.push(
        {
          key: `${keyBase}-road-out`,
          orientation: "h",
          column: childColumn,
          fromUnits: childUnits,
          toUnits: childUnits,
          segment: "out",
          onRoad: true,
        },
        {
          key: `${keyBase}-road-join`,
          orientation: "v",
          column: childColumn,
          fromUnits: Math.min(childUnits, parentUnits),
          toUnits: Math.max(childUnits, parentUnits),
          segment: "out",
          onRoad: true,
        },
        {
          key: `${keyBase}-road-in`,
          orientation: "h",
          column: childColumn,
          fromUnits: parentUnits,
          toUnits: parentUnits,
          segment: "in",
          onRoad: true,
        },
      );
    }
  }

  // Final -> champion capsule.
  const finalCell = finalMatch
    ? cells.find((c) => c.match === finalMatch)
    : undefined;
  const hasCapsule = Boolean(finalMatch?.decided && champion && finalCell);

  if (finalCell && hasCapsule) {
    connectors.push(
      {
        key: `${prefix}-capsule`,
        orientation: "h",
        column: finalCell.column,
        fromUnits: finalCell.topUnits,
        toUnits: finalCell.topUnits,
        segment: "capsule",
        onRoad: false,
      },
      {
        key: `${prefix}-capsule-road`,
        orientation: "h",
        column: finalCell.column,
        fromUnits: finalCell.topUnits,
        toUnits: finalCell.topUnits,
        segment: "capsule",
        onRoad: true,
      },
    );
  }

  return {
    columns,
    cells,
    connectors,
    finalMatch,
    placementMatches,
    columnCount,
    slotCount: Math.max(nextSlot, 1),
    hasCapsule,
    champion: hasCapsule ? champion : null,
    runnerUp: hasCapsule ? runnerUp : null,
  };
}

/**
 * The column a placement game belongs under: the column of the round it was
 * played in (5th Place under Semifinals, 3rd Place under the Championship).
 */
export function getPlacementColumn(
  stage: BracketStage,
  match: BracketMatchView,
): number {
  const index = stage.columns.findIndex((c) => c.round === match.round);
  return index >= 0 ? index : Math.max(match.round - 1, 0);
}
