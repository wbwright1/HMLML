import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { chunk } from "@/lib/chunk";
import { EMPTY_SLOT_ID } from "@/lib/sync/roster-slots";

/**
 * Guarantees every id in `playerIds` has a row in `players`, inserting a
 * minimal stub for any that are missing, and returns the ids it actually
 * created.
 *
 * Why stubs exist at all: `roster_players.player_id` and `draft_picks.player_id`
 * both carry a foreign key to `players.id`, but `players` is only refreshed once
 * a day from Sleeper's ~5MB `/players/nfl` snapshot. Sleeper has no per-player
 * endpoint, and CLAUDE.md forbids pulling that snapshot on demand, so a player
 * who joined a roster since the last daily run (waiver claim, practice-squad
 * call-up, freshly drafted rookie) has no row yet and the insert dies on the FK.
 *
 * Skipping the unknown id was rejected: it would quietly render a roster one
 * player short across the whole site. A stub keeps the roster truthful about who
 * is on it; the only unknown is the player's name and position, which every read
 * surface already renders as "Unknown Player".
 *
 * The stub is self-healing with no extra machinery: the daily players step
 * upserts with `onConflictDoUpdate` over every column, so the next daily run
 * fills the stub in. `updated_at IS NULL` is the marker for "stub, never seen in
 * a Sleeper snapshot", because the daily step always stamps `updated_at`.
 *
 * `names` is for callers who already know the player's name and whose ids the
 * daily snapshot will never heal (the legacy import): the stub carries the name
 * it has rather than throwing it away. It still leaves `updated_at` null, since
 * the row has still never been seen in a Sleeper snapshot.
 */
export async function ensurePlayersExist(
  playerIds: Iterable<string>,
  names?: ReadonlyMap<string, string | null>
): Promise<string[]> {
  const wanted = new Set<string>();
  for (const id of playerIds) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (trimmed.length === 0) continue;
    if (trimmed === EMPTY_SLOT_ID) continue;
    wanted.add(trimmed);
  }
  if (wanted.size === 0) return [];

  // One insert pass, no separate existence SELECT: onConflictDoNothing skips
  // the ids that already exist, and RETURNING then names exactly the rows this
  // call created. That matters for honest reporting, because the daily players
  // step can be writing the real row concurrently; an id we lost that race on
  // was not stubbed by us and must not be logged as if it was.
  const created: string[] = [];
  for (const batch of chunk([...wanted], 500)) {
    const inserted = await db
      .insert(players)
      .values(
        batch.map((id) => ({
          id,
          fullName: names?.get(id) ?? null,
          updatedAt: null,
        }))
      )
      .onConflictDoNothing({ target: players.id })
      .returning({ id: players.id });
    for (const row of inserted) created.push(row.id);
  }

  return created;
}
