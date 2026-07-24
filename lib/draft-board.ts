// ---------------------------------------------------------------------------
// Shared draft-board model — normalizes completed picks and upcoming
// (projected) picks into one shape so the grid/list rendering logic is written
// once, then assigns each pick to a stable per-franchise column.
//
// Column assignment: each pick's ORIGINAL draft-slot owner determines its
// column (established from round 1's pick order), not the current owner —
// that's what keeps a team's column stable across rounds in a real snake
// draft even when a specific round's pick was traded away. The cell then
// shows who actually made the pick, with a "via" note when that differs
// from the slot owner. This also means we never hardcode snake vs. linear:
// whichever order the underlying picks actually happened in is what renders.
//
// Slot ownership is keyed by the original franchise id when available
// (`originalId`), which is stable and unique per franchise. Keying by name
// alone would fracture a franchise's column: a team that traded away its
// round-1 pick would get a column under its name-key, while its own untraded
// later-round picks resolve under a different (id) key and match no column.
// ---------------------------------------------------------------------------

export interface PositionCounts {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
}

export interface ColumnMeta {
  key: string;
  name: string;
  slug: string | null;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
}

export interface NormalizedPick {
  pickNumber: number;
  round: number;
  playerId: string | null;
  playerName: string | null;
  playerPosition: string | null;
  roster: PositionCounts | null;
  currentId: string;
  currentName: string;
  currentSlug: string | null;
  currentAbbreviation: string | null;
  currentBrandingColor: string | null;
  currentAvatarUrl: string | null;
  originalId: string | null;
  originalName: string | null;
  originalSlug: string | null;
  originalAbbreviation: string | null;
  originalBrandingColor: string | null;
}

export interface DraftBoard {
  rounds: number[];
  columns: ColumnMeta[];
  grid: Map<number, (NormalizedPick | null)[]>;
  slots: Map<number, number>; // pickNumber -> 1-based slot within its round
}

export function buildDraftBoard(picks: NormalizedPick[]): DraftBoard {
  const rounds = Array.from(new Set(picks.map((p) => p.round))).sort((a, b) => a - b);
  if (rounds.length === 0) {
    return { rounds: [], columns: [], grid: new Map(), slots: new Map() };
  }

  // Identity lookup used to recover crest/slug info for a slot owner. Current
  // pick-maker fields (which carry avatarUrl) are registered first so they win;
  // a second pass fills in original-franchise identity for a slot owner who
  // traded away every pick we see and therefore never appears as a current maker.
  const infoByKey = new Map<string, ColumnMeta>();
  for (const p of picks) {
    const info: ColumnMeta = {
      key: p.currentId,
      name: p.currentName,
      slug: p.currentSlug,
      abbreviation: p.currentAbbreviation,
      brandingColor: p.currentBrandingColor,
      avatarUrl: p.currentAvatarUrl,
    };
    if (!infoByKey.has(p.currentId)) infoByKey.set(p.currentId, info);
    if (!infoByKey.has(`name:${p.currentName}`)) infoByKey.set(`name:${p.currentName}`, info);
  }
  for (const p of picks) {
    if (!p.originalId) continue;
    if (infoByKey.has(p.originalId)) continue;
    infoByKey.set(p.originalId, {
      key: p.originalId,
      name: p.originalName ?? p.currentName,
      slug: p.originalSlug,
      abbreviation: p.originalAbbreviation,
      brandingColor: p.originalBrandingColor,
      avatarUrl: null,
    });
  }

  function resolveSlotOwner(p: NormalizedPick): { key: string; info: ColumnMeta } {
    // Prefer the stable original-franchise id: a franchise's untraded picks and
    // its traded-away picks then share one column keyed on the slot's origin.
    if (p.originalId) {
      return {
        key: p.originalId,
        info: infoByKey.get(p.originalId) ?? {
          key: p.originalId,
          name: p.originalName ?? p.currentName,
          slug: p.originalSlug,
          abbreviation: p.originalAbbreviation,
          brandingColor: p.originalBrandingColor,
          avatarUrl: null,
        },
      };
    }
    // Upcoming boards have no original id, only an original name for traded picks.
    if (p.originalName) {
      const key = `name:${p.originalName}`;
      return {
        key,
        info: infoByKey.get(key) ?? {
          key,
          name: p.originalName,
          slug: p.originalSlug,
          abbreviation: p.originalAbbreviation,
          brandingColor: p.originalBrandingColor,
          avatarUrl: null,
        },
      };
    }
    // Untraded pick: the current maker is the slot owner.
    return {
      key: p.currentId,
      info: infoByKey.get(p.currentId) ?? {
        key: p.currentId,
        name: p.currentName,
        slug: p.currentSlug,
        abbreviation: p.currentAbbreviation,
        brandingColor: p.currentBrandingColor,
        avatarUrl: p.currentAvatarUrl,
      },
    };
  }

  const firstRound = rounds[0];
  const firstRoundPicks = picks
    .filter((p) => p.round === firstRound)
    .sort((a, b) => a.pickNumber - b.pickNumber);

  const columns: ColumnMeta[] = [];
  const columnIndexByKey = new Map<string, number>();
  for (const p of firstRoundPicks) {
    const { key, info } = resolveSlotOwner(p);
    if (!columnIndexByKey.has(key)) {
      columnIndexByKey.set(key, columns.length);
      columns.push(info);
    }
  }

  const totalColumns = columns.length || 1;
  const grid = new Map<number, (NormalizedPick | null)[]>();
  const slots = new Map<number, number>();

  for (const round of rounds) {
    const row = new Array<NormalizedPick | null>(totalColumns).fill(null);
    const roundPicks = picks
      .filter((p) => p.round === round)
      .sort((a, b) => a.pickNumber - b.pickNumber);

    roundPicks.forEach((p, idx) => {
      slots.set(p.pickNumber, idx + 1);
      const { key } = resolveSlotOwner(p);
      const target = columnIndexByKey.get(key);
      // Never silently overwrite an occupied cell or drop an unmatched pick:
      // fall back to the first empty column in this row so every pick lands.
      let col = target ?? -1;
      if (col < 0 || row[col] !== null) {
        col = row.indexOf(null);
        if (col < 0) col = Math.min(idx, totalColumns - 1);
      }
      row[col] = p;
    });

    grid.set(round, row);
  }

  return { rounds, columns, grid, slots };
}
