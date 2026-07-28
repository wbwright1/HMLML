import { cache } from "react";
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
 *
 * Wrapped in React `cache()` for per-request dedup. `cache()` keys on
 * SameValueZero equality of each argument, so two calls with different array
 * *references* (the common case: separate query modules each building their
 * own franchiseIds array from the same underlying rows) would not hit the
 * same cache entry even with identical contents. This thin wrapper normalizes
 * the id list into a sorted, deduped, comma-joined string key before handing
 * off to the cached implementation, so calls with the same *set* of ids
 * (regardless of array identity or order) dedupe to a single query.
 */
export async function getLatestAvatarUrls(
  franchiseIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(franchiseIds)].sort();
  return getLatestAvatarUrlsCached(ids.join(","));
}

const getLatestAvatarUrlsCached = cache(async function getLatestAvatarUrlsCached(
  idsKey: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = idsKey.length > 0 ? idsKey.split(",") : [];
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
});
