import { db } from "@/lib/db";
import { smackPosts, members, franchises } from "@/lib/db/schema";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { SMACK_MAX_LENGTH } from "@/lib/smack-shared";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";

// Re-exported so existing server-side consumers keep importing the cap from the
// query module; the canonical definition lives in the db-free lib/smack-shared.
export { SMACK_MAX_LENGTH };

export type SmackBodyValidation =
  | { ok: true; body: string }
  | { ok: false; error: string };

/**
 * Pure validation for a member smack post: trims, rejects empty, and enforces
 * the 280-char cap. Unit-tested; createSmackPost is the only writer and always
 * runs this first.
 */
export function validateSmackBody(raw: string): SmackBodyValidation {
  const body = raw.trim();
  if (body.length === 0) {
    return { ok: false, error: "Post cannot be empty." };
  }
  if (body.length > SMACK_MAX_LENGTH) {
    return {
      ok: false,
      error: `Post cannot exceed ${SMACK_MAX_LENGTH} characters.`,
    };
  }
  return { ok: true, body };
}

export type RecentSmackPost = Awaited<
  ReturnType<typeof getRecentSmackPosts>
>[number];

/**
 * The most recent non-hidden member smack posts, newest first, with the
 * author's display name, the attributed franchise's branding, and the
 * franchise's most recent season avatar (Sleeper crest) joined.
 *
 * The crest lives per season on franchise_seasons, so it is resolved in a
 * second pass: the newest non-null avatar per franchise wins. Kept as pure
 * Drizzle (no correlated raw SQL) and trivially cheap at league scale.
 */
export async function getRecentSmackPosts(limit: number) {
  const posts = await db
    .select({
      id: smackPosts.id,
      body: smackPosts.body,
      createdAt: smackPosts.createdAt,
      memberId: smackPosts.memberId,
      memberDisplayName: members.displayName,
      franchiseId: smackPosts.franchiseId,
      franchiseSlug: franchises.slug,
      franchiseName: franchises.name,
      franchiseAbbreviation: franchises.abbreviation,
      franchiseBrandingColor: franchises.brandingColor,
    })
    .from(smackPosts)
    .innerJoin(members, eq(smackPosts.memberId, members.id))
    .innerJoin(franchises, eq(smackPosts.franchiseId, franchises.id))
    .where(eq(smackPosts.hidden, false))
    .orderBy(desc(smackPosts.createdAt))
    .limit(limit);

  if (posts.length === 0) {
    return posts.map((p) => ({ ...p, avatarUrl: null as string | null }));
  }

  // The crest avatar is decorative and resolved defensively; the helper
  // degrades to an empty map (monogram crests) rather than blanking the feed.
  const avatarByFranchise = await getLatestAvatarUrls(
    posts.map((p) => p.franchiseId),
  );

  return posts.map((p) => ({
    ...p,
    avatarUrl: avatarByFranchise.get(p.franchiseId) ?? null,
  }));
}

/**
 * True when ANY smack post exists, hidden or not. The hubs use this to decide
 * between the Site Desk seed fallback (only when the board is genuinely empty)
 * and an honest "nothing on the board" state (when posts exist but are all
 * hidden), so moderation can never resurrect the seeds.
 */
export async function anySmackPostsExist(): Promise<boolean> {
  const [row] = await db.select({ c: count() }).from(smackPosts).limit(1);
  return (row?.c ?? 0) > 0;
}

/**
 * Creates a member smack post attributed to the given franchise. Validates and
 * trims the body server-side; throws on invalid input. Returns the created row.
 */
export async function createSmackPost(
  memberId: number,
  franchiseId: string,
  body: string,
) {
  const validation = validateSmackBody(body);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const [row] = await db
    .insert(smackPosts)
    .values({
      memberId,
      franchiseId,
      body: validation.body,
    })
    .returning();

  return row;
}

/**
 * Counts a member's posts (hidden or not) within the last `windowMinutes`,
 * for server-side rate limiting.
 */
export async function countRecentPostsByMember(
  memberId: number,
  windowMinutes: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
  const [row] = await db
    .select({ c: count() })
    .from(smackPosts)
    .where(
      and(eq(smackPosts.memberId, memberId), gt(smackPosts.createdAt, cutoff)),
    );
  return row?.c ?? 0;
}

/** Sets (or clears) the hidden flag on a post for commish moderation. */
export async function setPostHidden(
  postId: number,
  hidden: boolean,
): Promise<void> {
  await db
    .update(smackPosts)
    .set({ hidden })
    .where(eq(smackPosts.id, postId));
}
