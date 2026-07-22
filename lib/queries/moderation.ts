import { db } from "@/lib/db";
import { smackPosts, members, franchises } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";

/**
 * The most recent member smack posts INCLUDING hidden ones, newest first, with
 * the author's display name, the attributed franchise's branding, and its
 * current-season crest joined. Powers the commish moderation panel, where
 * hidden posts must remain visible (with an unhide control) rather than
 * disappearing. The public feed uses getRecentSmackPosts (hidden excluded).
 */
export async function getAllSmackPostsForModeration(limit: number) {
  const rows = await db
    .select({
      id: smackPosts.id,
      body: smackPosts.body,
      hidden: smackPosts.hidden,
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
    .orderBy(desc(smackPosts.createdAt))
    .limit(limit);

  const avatars = await getLatestAvatarUrls(rows.map((r) => r.franchiseId));

  return rows.map((r) => ({
    ...r,
    franchiseAvatarUrl: avatars.get(r.franchiseId) ?? null,
  }));
}
