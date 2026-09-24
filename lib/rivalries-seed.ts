// Commissioner-named rivalries seeded into the rivalries table. The live copy
// is edited from /commish; this file is the starting point and the record of
// what shipped, not the source of truth afterwards. The seed is an idempotent
// upsert on the franchise pair, so re-running it overwrites a /commish edit to
// these pairs: only do that on purpose.
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
      "Beau and Riley co-owned one team before the split. Every meeting since is another hearing on who walked away with the better half. Riley is 0-3 against Beau since the split, including a 2024 semifinal where Riley put up 183.60 and still lost.",
    originYear: null,
    trophyName: null,
  },
  {
    // McCarthyism (Wheeler) vs Vanilla Vick (Jackson)
    franchiseOneId: "662444232488861696",
    franchiseTwoId: "662174578797273088",
    name: "The Sweep Tax",
    tagline: "Sweep the regular season, pay for it in the playoffs.",
    origin:
      "Jackson swept Wheeler in 2022. Wheeler returned the favor in 2025, including a 95-point beatdown in Week 14. Two weeks later they met in the semifinal and Jackson won 157.74 to 86.42. Every time these two have met in the playoffs, the one who got swept got the last word.",
    originYear: null,
    trophyName: null,
  },
  {
    // The Tokyo Thunderbirds (Blake) vs Foopus (Daniel)
    franchiseOneId: "337850257649987584",
    franchiseTwoId: "685237785795293184",
    name: "Wrong Time of Year",
    tagline: "Blake owns the regular season. Daniel owns December.",
    origin:
      "Blake is 5-2 against Daniel in the regular season. It hasn't mattered. Daniel knocked Blake out of the 2023 semifinal 157.60 to 107.42 on the way to the title, then did it again in the 2025 opening round, 171.22 to 129.92.",
    originYear: null,
    trophyName: null,
  },
  {
    // Better call Hall (Collin) vs McCarthyism (Wheeler)
    franchiseOneId: "661810120119881728",
    franchiseTwoId: "662444232488861696",
    name: "The Dead Heat",
    tagline: "Ten games. 1.20 points apart.",
    origin:
      "Across ten meetings, Wheeler has outscored Collin by 1.20 points total: 1454.12 to 1452.92. Wheeler leads the series 6-4 and took the 2021 third-place game, so the points call it a tie and the record says otherwise.",
    originYear: null,
    trophyName: null,
  },
  {
    // Better call Myballs (William) vs Of Mice and Mendoza (Riley)
    franchiseOneId: "687176498725081088",
    franchiseTwoId: "662204930538422272",
    name: "Pest Control",
    tagline: "Of Mice and Mendoza has a William problem.",
    origin:
      "William has outscored Riley in seven of their eight meetings, including a 2022 losers-bracket game. Riley's only win came in Week 2 of 2024. The most recent loss, in 2025, was by 3.50.",
    originYear: null,
    trophyName: null,
  },
  {
    // Taking Boutte (Batson) vs Vanilla Vick (Jackson)
    franchiseOneId: "685240664639750144",
    franchiseTwoId: "662174578797273088",
    name: "The Curse Breaker",
    tagline: "Six straight one way, four straight the other.",
    origin:
      "Batson won the first six meetings, including the 2021 title game, 170.74 to 136.02. Jackson has won the last four, including a 2025 playoff game, 145.20 to 111.30. The series is 6-4, and it's Jackson's turn.",
    originYear: null,
    trophyName: null,
  },
  {
    // Bucky's General Store (Landon) vs Better call Myballs (William)
    franchiseOneId: "687106446546001920",
    franchiseTwoId: "687176498725081088",
    name: "The Plunger Bowl",
    tagline: "They keep meeting where nobody wants to be.",
    origin:
      "Landon and William have met in the losers bracket four times in five seasons. The first was the 2021 Toilet Bowl final, which Landon won, meaning Landon finished dead last. The regular-season series is 3-3.",
    originYear: null,
    trophyName: null,
  },
  {
    // Taking Boutte (Batson) vs Bucky's General Store (Landon)
    franchiseOneId: "685240664639750144",
    franchiseTwoId: "687106446546001920",
    name: "The Landlord",
    tagline: "Five meetings. Five rent checks.",
    origin:
      "Batson is 5-0 against Landon, one win a season since 2021. The first one was by 0.26 points, 148.62 to 148.36, and Landon has been paying ever since.",
    originYear: null,
    trophyName: null,
  },
  {
    // Latter Day Lamb Special (Shelton) vs Real Olave Garden (Beau)
    franchiseOneId: "696838517652824064",
    franchiseTwoId: "710650554438709248",
    name: "The Handoff",
    tagline: "One of them wins the title. The other one is next.",
    origin:
      "Shelton beat Beau 120.12 to 113.88 in the 2024 title game. In 2025 Beau swept Shelton in the regular season and won the title, while Shelton finished dead last in the Toilet Bowl.",
    originYear: null,
    trophyName: null,
  },
  {
    // Foopus (Daniel) vs Watson Love Diggs (Jack)
    franchiseOneId: "685237785795293184",
    franchiseTwoId: "685396254645129216",
    name: "Penthouse to Basement",
    tagline: "Met at the top in 2023. Met at the bottom in 2024.",
    origin:
      "Daniel knocked Jack out of the 2023 playoffs 156.72 to 112.38 on the way to the title. A year later the defending champ was back across from Jack in the Toilet Bowl final, and Jack scored less (111.52 to 114.36) to finish dead last. Daniel leads the series 6-3.",
    originYear: null,
    trophyName: null,
  },
];
