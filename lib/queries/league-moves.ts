import { db } from "@/lib/db";
import { franchises, franchiseSeasons, players, transactions } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { formatRelativeTime } from "@/lib/relative-time";

// ---------------------------------------------------------------------------
// League Moves
// ---------------------------------------------------------------------------
// The hub rail's replacement for the Sleeper "Trending" module: what THIS
// league actually did, read only from our own synced transactions table (no
// live Sleeper call on a page path).
//
// A fourth transactions query rather than a reuse: getRecentTransactions
// (lib/queries/offseason.ts) and content-activity's counter both throw away
// franchise identity, and the rail's whole point is the crest beside the move.
// The selection and copy live in a pure function here; the DB work is the thin
// wrapper below it.

/** Enough of a franchise for the rail to draw its crest beside its name. */
export interface MoveFranchise {
  id: string;
  name: string;
  slug: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
}

export type LeagueMoveKind = "ADD" | "DROP" | "TRADE";

/** The headline player a move's row is about. */
export interface MovePlayer {
  /** Null when the id resolves to no players row; PlayerLink/PlayerHeadshot degrade cleanly. */
  id: string | null;
  name: string;
  position: string | null;
  nflTeam: string | null;
}

export interface LeagueMove {
  transactionId: string;
  /** Always printed as a text label; never color alone. */
  kind: LeagueMoveKind;
  /** The player the row headlines. */
  headline: MovePlayer;
  /** One franchise for an add/drop, both sides for a trade. */
  franchises: MoveFranchise[];
  /** One truncating line naming everything else on the move (other players, picks-only). */
  support: string;
  /** Compact recency, e.g. "2d ago". Empty when Sleeper gave us no timestamp. */
  age: string;
}

/** Raw transaction shape the pure selector works over. */
export interface TransactionRow {
  transactionId: string;
  type: string;
  status: string | null;
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
  rosterIds: number[] | null;
  /** Sleeper event time, epoch milliseconds. */
  createdAtSleeper: number | null;
}

const DEFAULT_LIMIT = 4;

/** Names past two collapse, so the row stays one truncating line. */
function formatNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

/** "2d ago" / "just now"; empty when there is no honest timestamp to print. */
export function formatMoveAge(
  createdAtSleeper: number | null,
  now: number = Date.now()
): string {
  if (createdAtSleeper == null) return "";
  const relative = formatRelativeTime(new Date(createdAtSleeper).toISOString(), now);
  if (relative === "") return "";
  return relative === "now" ? "just now" : `${relative} ago`;
}

export interface SelectLeagueMovesOptions {
  limit?: number;
  now?: number;
}

/**
 * Turns raw transaction rows into rail-ready League Moves. Pure: no DB access,
 * fully unit-testable.
 *
 * Rows are expected newest-first and are kept in that order. A row is dropped
 * when it did not go through (a failed waiver claim is not a move), when no
 * roster on it maps to a franchise, or when it names no players at all: there
 * would be nothing true left to print.
 */
export function selectLeagueMoves(
  rows: TransactionRow[],
  franchiseByRoster: Map<string, MoveFranchise>,
  playerById: Map<string, MovePlayer>,
  opts: SelectLeagueMovesOptions = {}
): LeagueMove[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const now = opts.now ?? Date.now();
  const moves: LeagueMove[] = [];

  const nameOf = (playerId: string): string =>
    playerById.get(playerId)?.name ?? "a player";

  const headlineOf = (playerId: string): MovePlayer =>
    playerById.get(playerId) ?? {
      id: null,
      name: "a player",
      position: null,
      nflTeam: null,
    };

  for (const row of rows) {
    if (moves.length >= limit) break;
    if (row.status != null && row.status !== "complete") continue;

    const addIds = Object.keys(row.adds ?? {});
    const dropIds = Object.keys(row.drops ?? {});
    const isTrade = row.type === "trade";

    const franchisesOnRow: MoveFranchise[] = [];
    const pushFranchise = (rosterId: string | number | undefined) => {
      if (rosterId == null) return;
      const franchise = franchiseByRoster.get(String(rosterId));
      if (!franchise) return;
      if (franchisesOnRow.some((f) => f.id === franchise.id)) return;
      franchisesOnRow.push(franchise);
    };

    let kind: LeagueMoveKind;
    let headline: MovePlayer;
    let support: string;

    if (isTrade) {
      kind = "TRADE";
      for (const rosterId of row.rosterIds ?? []) pushFranchise(rosterId);
      for (const rosterId of Object.values(row.adds ?? {})) pushFranchise(rosterId);
      if (addIds.length > 0) {
        headline = headlineOf(addIds[0]);
        support = formatNames(addIds.slice(1).map(nameOf));
      } else {
        headline = { id: null, name: "a player", position: null, nflTeam: null };
        support = "Draft picks only";
      }
    } else if (addIds.length > 0) {
      kind = "ADD";
      pushFranchise(row.adds?.[addIds[0]]);
      headline = headlineOf(addIds[0]);
      const dropTail =
        dropIds.length > 0 ? `Dropped ${formatNames(dropIds.map(nameOf))}` : "";
      const extraAdds = formatNames(addIds.slice(1).map(nameOf));
      support = [extraAdds, dropTail].filter(Boolean).join(", ");
    } else if (dropIds.length > 0) {
      kind = "DROP";
      pushFranchise(row.drops?.[dropIds[0]]);
      headline = headlineOf(dropIds[0]);
      support = formatNames(dropIds.slice(1).map(nameOf));
    } else {
      continue;
    }

    if (franchisesOnRow.length === 0) continue;

    moves.push({
      transactionId: row.transactionId,
      kind,
      headline,
      franchises: franchisesOnRow.slice(0, 2),
      support,
      age: formatMoveAge(row.createdAtSleeper, now),
    });
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Query (thin DB wrapper)
// ---------------------------------------------------------------------------

/** Scanned rows per request; oversampled so filtered-out rows still leave a full rail. */
const SCAN_LIMIT = 24;

/**
 * The league's most recent completed moves for a season, with franchise
 * identity and player names resolved. Reads Postgres only. Degrades to [] on
 * any failure: the card is optional content and absence is fine.
 */
export async function getRecentLeagueMoves(
  seasonId: number,
  limit = DEFAULT_LIMIT
): Promise<LeagueMove[]> {
  try {
    const [rows, franchiseRows] = await Promise.all([
      db
        .select({
          transactionId: transactions.transactionId,
          type: transactions.type,
          status: transactions.status,
          adds: transactions.adds,
          drops: transactions.drops,
          rosterIds: transactions.rosterIds,
          createdAtSleeper: transactions.createdAtSleeper,
        })
        .from(transactions)
        .where(eq(transactions.seasonId, seasonId))
        .orderBy(desc(transactions.createdAtSleeper))
        .limit(SCAN_LIMIT),
      db
        .select({
          rosterId: franchiseSeasons.rosterId,
          id: franchises.id,
          name: franchises.name,
          slug: franchises.slug,
          abbreviation: franchises.abbreviation,
          brandingColor: franchises.brandingColor,
          avatarUrl: franchiseSeasons.avatarUrl,
        })
        .from(franchiseSeasons)
        .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
        .where(eq(franchiseSeasons.seasonId, seasonId)),
    ]);

    const franchiseByRoster = new Map<string, MoveFranchise>(
      franchiseRows.map((f) => [
        f.rosterId,
        {
          id: f.id,
          name: f.name,
          slug: f.slug,
          abbreviation: f.abbreviation,
          brandingColor: f.brandingColor,
          avatarUrl: f.avatarUrl,
        },
      ])
    );

    const typedRows: TransactionRow[] = rows.map((r) => ({
      transactionId: r.transactionId,
      type: r.type,
      status: r.status,
      adds: (r.adds as Record<string, number> | null) ?? null,
      drops: (r.drops as Record<string, number> | null) ?? null,
      rosterIds: (r.rosterIds as number[] | null) ?? null,
      createdAtSleeper: r.createdAtSleeper,
    }));

    const playerIds = [
      ...new Set(
        typedRows.flatMap((r) => [
          ...Object.keys(r.adds ?? {}),
          ...Object.keys(r.drops ?? {}),
        ])
      ),
    ];

    const playerById = new Map<string, MovePlayer>();
    if (playerIds.length > 0) {
      const playerRows = await db
        .select({
          id: players.id,
          fullName: players.fullName,
          position: players.position,
          nflTeam: players.nflTeam,
        })
        .from(players)
        .where(inArray(players.id, playerIds));
      for (const p of playerRows) {
        if (p.fullName) {
          playerById.set(p.id, {
            id: p.id,
            name: p.fullName,
            position: p.position ?? null,
            nflTeam: p.nflTeam ?? null,
          });
        }
      }
    }

    return selectLeagueMoves(typedRows, franchiseByRoster, playerById, { limit });
  } catch (e) {
    console.error("[league-moves] getRecentLeagueMoves error:", e);
    return [];
  }
}
