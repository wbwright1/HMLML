/**
 * Maps Sleeper user IDs and usernames to league members' real first names.
 * Used everywhere a franchise owner or co-owner is displayed, so the site
 * shows "Collin" instead of a Sleeper username like "r2ampage6".
 */
export type OwnerNameEntry = {
  userId: string;
  sleeperUsername: string;
  realName: string;
  aliases?: string[];
};

export const OWNER_NAMES: OwnerNameEntry[] = [
  { userId: "661810120119881728", sleeperUsername: "r2ampage6", realName: "Collin" },
  { userId: "687176498725081088", sleeperUsername: "warnold24", realName: "William" },
  { userId: "687106446546001920", sleeperUsername: "bellybuttonfluff", realName: "Landon" },
  { userId: "696846017655549952", sleeperUsername: "thebiscottiway", realName: "Carson" },
  { userId: "685237785795293184", sleeperUsername: "OOcancerman", realName: "Daniel" },
  { userId: "1266487516207251456", sleeperUsername: "ERA11", realName: "Ethan" },
  { userId: "696838517652824064", sleeperUsername: "swjohnson2", realName: "Shelton" },
  { userId: "662444232488861696", sleeperUsername: "WheelerGreene12", realName: "Wheeler" },
  { userId: "662204930538422272", sleeperUsername: "MattSchaubDaGoat", realName: "Riley" },
  { userId: "710650554438709248", sleeperUsername: "beauc43", realName: "Beau" },
  { userId: "685240664639750144", sleeperUsername: "batson999", realName: "Batson" },
  {
    userId: "337850257649987584",
    sleeperUsername: "wbwright514",
    realName: "Blake",
    aliases: ["Snakethorn"],
  },
  { userId: "662174578797273088", sleeperUsername: "cjryan99", realName: "Jackson" },
  { userId: "740058109535510528", sleeperUsername: "Badussy6969", realName: "Patton" },
  { userId: "685396254645129216", sleeperUsername: "jegentry1", realName: "Jack" },
];

const byUserId = new Map<string, OwnerNameEntry>(
  OWNER_NAMES.map((entry) => [entry.userId, entry])
);

const byUsername = new Map<string, OwnerNameEntry>();
for (const entry of OWNER_NAMES) {
  byUsername.set(entry.sleeperUsername.toLowerCase(), entry);
  for (const alias of entry.aliases ?? []) {
    byUsername.set(alias.toLowerCase(), entry);
  }
}

/**
 * Resolves a real first name for an owner given their Sleeper user id and/or
 * their display name (which, historically, was often just their username).
 * Tries the user id first, then a case-insensitive username/alias lookup,
 * falling back to the raw display name (never undefined-ing out a name that
 * was actually passed in).
 */
export function resolveOwnerName({
  userId,
  displayName,
}: {
  userId?: string | null;
  displayName?: string | null;
}): string | undefined {
  if (userId) {
    const byId = byUserId.get(userId);
    if (byId) return byId.realName;
  }
  if (displayName) {
    const byName = byUsername.get(displayName.toLowerCase());
    if (byName) return byName.realName;
  }
  return displayName ?? undefined;
}

/**
 * Resolves a pre-joined "username & username" co-owner string (as stored in
 * franchise_seasons.co_owner_display_name) into real names joined the same
 * way, e.g. "bellybuttonfluff & thebiscottiway" -> "Landon & Carson".
 * Each piece is resolved independently by username; a piece with no known
 * mapping falls back to itself rather than dropping it.
 */
export function resolveCoOwnerNames(
  joined: string | null | undefined
): string | undefined {
  if (joined == null) return undefined;
  return joined
    .split(" & ")
    .map((piece) => {
      const match = byUsername.get(piece.toLowerCase());
      return match ? match.realName : piece;
    })
    .join(" & ");
}
