// Commissioner-named rivalries seeded into the rivalries table. The live copy
// is edited from /commish; this file is the starting point and the record of
// what shipped, not the source of truth afterwards. The seed is an idempotent
// upsert on the franchise pair, so re-running it overwrites a /commish edit to
// these two pairs: only do that on purpose.
//
// Franchise ids are the primary owner's Sleeper user id (verified against the
// franchises table). Pairs may be listed in either order; the seed stores
// them canonically. Lore here is editorial and must stay true: no invented
// years, scores or events. Leave originYear and trophyName null until the
// commish supplies them.

export interface RivalrySeed {
  franchiseOneId: string;
  franchiseTwoId: string;
  name: string;
  tagline: string | null;
  origin: string | null;
  originYear: number | null;
  trophyName: string | null;
}

export const RIVALRIES_SEED: RivalrySeed[] = [
  {
    // Real Olave Garden (Beau) vs Of Mice and Mendoza (Riley)
    franchiseOneId: "710650554438709248",
    franchiseTwoId: "662204930538422272",
    name: "The Custody Battle",
    tagline: "They used to share a team. Now they share a grudge.",
    origin:
      "Beau and Riley co-owned one team before the split. Every meeting since is another hearing on who walked away with the better half.",
    originYear: null,
    trophyName: null,
  },
  {
    // McCarthyism (Wheeler) vs Vanilla Vick (Jackson)
    franchiseOneId: "662444232488861696",
    franchiseTwoId: "662174578797273088",
    name: "The Split Decision",
    tagline: "They trade wins all season, then settle it in the playoffs.",
    origin:
      "Wheeler and Jackson have a habit of splitting the regular-season series and running into each other again when it counts. Neither one has pulled away yet.",
    originYear: null,
    trophyName: null,
  },
];
