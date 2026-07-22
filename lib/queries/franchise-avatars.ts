import { db } from "@/lib/db";
import { franchiseSeasons, seasons } from "@/lib/db/schema";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

/**
 * Resolves the most recent per-season team avatar (Sleeper crest) for each of
 * the given franchises. The crest lives per season on franchise_seasons, so the
 * newest non-null avatar wins, ordered by the joined season YEAR (not seasonId,
 * which is an insertion-order surrogate that can diverge from chronology).
 *
 * The avatar is decorative everywhere it is used: if the avatar_url column is
 * unavailable (e.g. a DB where migration 0008's member tables exist but its
 * franchise_seasons.avatar_url column has not landed), this degrades to an
 * empty map so callers fall back to monogram crests instead of throwing.
 */
export async function getLatestAvatarUrls(
  franchiseIds: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(franchiseIds)];
  if (ids.length === 0) return map;

  try {
    const rows = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        avatarUrl: franchiseSeasons.avatarUrl,
      })
      .from(franchiseSeasons)
      .innerJoin(seasons, eq(franchiseSeasons.seasonId, seasons.id))
      .where(
        and(
          inArray(franchiseSeasons.franchiseId, ids),
          isNotNull(franchiseSeasons.avatarUrl),
        ),
      )
      .orderBy(desc(seasons.seasonYear));

    for (const row of rows) {
      if (row.avatarUrl && !map.has(row.franchiseId)) {
        map.set(row.franchiseId, row.avatarUrl);
      }
    }
  } catch {
    // Avatars unavailable; callers render monogram crests.
  }

  return map;
}
