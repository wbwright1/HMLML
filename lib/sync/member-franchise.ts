// Pure helper for member sync: builds the userId -> franchiseId map from the
// current-season rosters. Extracted from syncMembers so the ownership
// precedence rule can be unit-tested without a DB or the Sleeper API.

/** The ownership fields of a roster that member sync reads. */
export interface RosterOwnership {
  owner_id: string | null;
  co_owners?: string[] | null;
}

/**
 * Maps every current owner and co-owner to the franchise they control (the
 * roster's owner id is the franchise id). Built in two passes so PRIMARY
 * ownership always wins over co-ownership regardless of roster iteration order:
 * co-owners are laid down first, then primary owners overwrite. Without this, a
 * user who primary-owns roster A but co-owns roster B could be attributed to B
 * purely on iteration order.
 */
export function buildMemberFranchiseMap(
  rosters: readonly RosterOwnership[],
): Map<string, string> {
  const map = new Map<string, string>(); // userId -> franchiseId

  // Pass 1: co-owners.
  for (const roster of rosters) {
    const ownerId = roster.owner_id;
    if (!ownerId) continue; // unowned roster contributes no member
    for (const coOwnerId of roster.co_owners ?? []) {
      map.set(coOwnerId, ownerId);
    }
  }

  // Pass 2: primary owners overwrite any co-owner entry for the same user.
  for (const roster of rosters) {
    const ownerId = roster.owner_id;
    if (!ownerId) continue;
    map.set(ownerId, ownerId);
  }

  return map;
}
