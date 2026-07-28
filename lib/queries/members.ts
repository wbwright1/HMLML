import { db } from "@/lib/db";
import { members, franchises } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { resolveOwnerName } from "@/lib/owner-names";

/**
 * All members with their currently-controlled franchise joined (slug, name,
 * branding, current-season crest). Powers the commish roster/claim-code page.
 * Ordered by display name. franchise columns are null for an unattached member.
 */
export async function getAllMembersWithFranchise() {
  try {
    const rows = await db
      .select({
        id: members.id,
        sleeperUserId: members.sleeperUserId,
        displayName: members.displayName,
        role: members.role,
        franchiseId: members.franchiseId,
        claimCodeHash: members.claimCodeHash,
        codeGeneratedAt: members.codeGeneratedAt,
        createdAt: members.createdAt,
        updatedAt: members.updatedAt,
        franchiseSlug: franchises.slug,
        franchiseName: franchises.name,
        franchiseAbbreviation: franchises.abbreviation,
        franchiseBrandingColor: franchises.brandingColor,
      })
      .from(members)
      .leftJoin(franchises, eq(members.franchiseId, franchises.id))
      .orderBy(asc(members.displayName));

    const avatars = await getLatestAvatarUrls(
      rows.map((r) => r.franchiseId).filter((id): id is string => Boolean(id)),
    );

    return rows.map((r) => ({
      ...r,
      displayName:
        resolveOwnerName({ userId: r.sleeperUserId, displayName: r.displayName }) ??
        r.displayName,
      franchiseAvatarUrl: r.franchiseId
        ? avatars.get(r.franchiseId) ?? null
        : null,
    }));
  } catch (e) {
    console.error("[members] getAllMembersWithFranchise error:", e);
    return [];
  }
}

/** Looks up a member by their stable Sleeper user id, or null. */
export async function getMemberBySleeperUserId(sleeperUserId: string) {
  try {
    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.sleeperUserId, sleeperUserId))
      .limit(1);
    if (!member) return null;
    return {
      ...member,
      displayName:
        resolveOwnerName({
          userId: member.sleeperUserId,
          displayName: member.displayName,
        }) ?? member.displayName,
    };
  } catch (e) {
    console.error("[members] getMemberBySleeperUserId error:", e);
    return null;
  }
}
