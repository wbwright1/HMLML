import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { chunk } from "@/lib/chunk";

/**
 * Guarantees every id in `playerIds` has a row in `players`, inserting a
 * minimal stub for any that are missing, and returns the ids it stubbed.
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
 */
export async function ensurePlayersExist(
  playerIds: Iterable<string>
): Promise<string[]> {
  const wanted = new Set<string>();
  for (const id of playerIds) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (trimmed.length === 0) continue;
    wanted.add(trimmed);
  }
  if (wanted.size === 0) return [];

  const missing = new Set(wanted);
  for (const batch of chunk([...wanted], 500)) {
    const existing = await db
      .select({ id: players.id })
      .from(players)
      .where(inArray(players.id, batch));
    for (const row of existing) missing.delete(row.id);
  }
  if (missing.size === 0) return [];

  const stubbed = [...missing];
  for (const batch of chunk(stubbed, 500)) {
    // onConflictDoNothing so a concurrent daily run that wrote the real row
    // first wins: a stub must never clobber a real name.
    await db
      .insert(players)
      .values(batch.map((id) => ({ id, updatedAt: null })))
      .onConflictDoNothing({ target: players.id });
  }

  return stubbed;
}
