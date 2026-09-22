import { describe, it, expect } from "vitest";
import {
  heroHeadline,
  heroHeadlineLadder,
  heroDekFromData,
  heroKickerTail,
  numeralSegments,
  finalsFromPairedMatchups,
  HERO_FALLBACK_HEADLINE,
  type HeroFinal,
  type HeroHeadlineInput,
  type HeroSlateGame,
  type HeroSlateTeam,
} from "./hero-headline";
import { SIGNATURE_PHRASES, normalize } from "@/lib/content-gen/phrases";

// ---------------------------------------------------------------------------
// Fixtures: the real 2026 league going into week 3 (live DB, 2026-09-22).
// ---------------------------------------------------------------------------

const NAMES = {
  ROG: "Real Olave Garden",
  LDL: "Latter Day Lamb Special",
  MCC: "McCarthyism",
  TTT: "The Tokyo Thunderbirds",
  BCH: "Better call Hall",
  BGS: "Bucky’s General Store",
  VV: "Vanilla Vick",
  WLD: "Watson Love Diggs",
  BCM: "Better call Myballs",
  FOO: "Foopus",
  OMM: "Of Mice and Mendoza",
  TB: "Taking Boutte",
} as const;
type Id = keyof typeof NAMES;

function t(id: Id, wins: number, losses: number, ties = 0): HeroSlateTeam {
  return { franchiseId: id, name: NAMES[id], wins, losses, ties };
}

const W3: Record<Id, HeroSlateTeam> = {
  ROG: t("ROG", 2, 0),
  LDL: t("LDL", 2, 0),
  MCC: t("MCC", 2, 0),
  TTT: t("TTT", 2, 0),
  BCH: t("BCH", 1, 1),
  BGS: t("BGS", 1, 1),
  VV: t("VV", 1, 1),
  WLD: t("WLD", 1, 1),
  BCM: t("BCM", 0, 2),
  FOO: t("FOO", 0, 2),
  OMM: t("OMM", 0, 2),
  TB: t("TB", 0, 2),
};

function game(
  a: HeroSlateTeam,
  b: HeroSlateTeam,
  extra: Partial<HeroSlateGame> = {}
): HeroSlateGame {
  return {
    a,
    b,
    divisionName: null,
    canFlipDivisionLead: false,
    namedRivalry: null,
    isGameOfWeek: false,
    ...extra,
  };
}

// Week 3 slate, the Game of the Week as the engine now picks it (TTT v WLD).
const W3_SLATE: HeroSlateGame[] = [
  game(W3.ROG, W3.OMM, { divisionName: "Division 2", namedRivalry: { name: "The Custody Battle" } }),
  game(W3.BCM, W3.FOO, { divisionName: "Division 2" }),
  game(W3.TTT, W3.WLD, { isGameOfWeek: true }),
  game(W3.BCH, W3.TB),
  game(W3.MCC, W3.BGS),
  game(W3.LDL, W3.VV, { namedRivalry: { name: "The Split Decision" } }),
];

function final(w: Id, wp: number, l: Id, lp: number): HeroFinal {
  return {
    winner: { franchiseId: w, name: NAMES[w], points: wp },
    loser: { franchiseId: l, name: NAMES[l], points: lp },
    margin: Math.round(Math.abs(wp - lp) * 10) / 10,
  };
}

// Week 2 finals, as getWeekRecap returns them (biggest margin first).
const W2_FINALS: HeroFinal[] = [
  final("TTT", 204.94, "TB", 140.78),
  final("MCC", 163.9, "OMM", 114.54),
  final("LDL", 127.18, "BCH", 95.56),
  final("VV", 118.4, "FOO", 93.22),
  final("BGS", 128.36, "WLD", 103.6),
  final("ROG", 152.1, "BCM", 127.4),
];

const LIVE: HeroHeadlineInput = {
  recapShown: true,
  priorFinals: W2_FINALS,
  slate: W3_SLATE,
  standings: Object.values(W3),
};

// ---------------------------------------------------------------------------

describe("heroHeadline: the live week-3 shape", () => {
  it("recap shown: leads with Taking Boutte's 64.2-point loss, dek takes the 204.9", () => {
    const h = heroHeadline(LIVE);
    expect(h).toEqual({ rung: "mercy", text: "Taking Boutte lost by 64.2. It was not that close." });
    expect(heroDekFromData(LIVE, h)).toBe(
      "The Tokyo Thunderbirds put up 204.9 and the rest of the league noticed."
    );
  });

  it("recap not shown: leads with the 0-2 v 0-2 game, dek names the rivalry on the slate", () => {
    const input = { ...LIVE, recapShown: false };
    const h = heroHeadline(input);
    expect(h).toEqual({ rung: "winless-clash", text: "Somebody is about to be 0-3." });
    expect(heroDekFromData(input, h)).toBe("The Custody Battle is back on the slate.");
  });

  it("no rung claims an unbeaten clash: none of the four 2-0 teams meet", () => {
    const rungs = heroHeadlineLadder({ ...LIVE, recapShown: false }).map((l) => l.rung);
    expect(rungs).not.toContain("unbeaten-clash");
    expect(rungs).not.toContain("division-flip");
  });
});

describe("heroHeadline: recap-mode rungs", () => {
  const recap = (finals: HeroFinal[]): HeroHeadlineInput => ({
    recapShown: true,
    priorFinals: finals,
    slate: [],
    standings: [],
  });

  it("mercy needs a 40-point margin", () => {
    expect(heroHeadline(recap([final("MCC", 150, "OMM", 110)])).rung).toBe("mercy");
    expect(heroHeadline(recap([final("MCC", 150, "OMM", 110.1)])).rung).not.toBe("mercy");
  });

  it("monster score: a sole top score of 180 or more", () => {
    const h = heroHeadline(recap([final("TTT", 190.44, "TB", 170), final("ROG", 120, "BCM", 110)]));
    expect(h).toEqual({
      rung: "monster",
      text: "The Tokyo Thunderbirds put up 190.4 and the rest of the league noticed.",
    });
    // A shared high is not one team's statement.
    expect(heroHeadline(recap([final("TTT", 185, "TB", 170), final("ROG", 185, "BCM", 150)])).rung).not.toBe(
      "monster"
    );
  });

  it("photo finish: decided by 3 or less, never a tie", () => {
    const h = heroHeadline(recap([final("VV", 120.8, "FOO", 120), final("ROG", 130, "BCM", 110)]));
    expect(h).toEqual({
      rung: "photo-finish",
      text: "Decided by 0.8. Foopus is still refreshing the box score.",
    });
    const tie: HeroFinal = { ...final("VV", 120, "FOO", 120), margin: 0 };
    expect(heroHeadline(recap([tie, final("ROG", 130, "BCM", 110)])).rung).not.toBe("photo-finish");
  });

  it("dud: a sole low score of 90 or less", () => {
    const h = heroHeadline(recap([final("ROG", 120, "OMM", 82.48), final("MCC", 130, "BCM", 110)]));
    expect(h).toEqual({ rung: "dud", text: "Of Mice and Mendoza managed 82.5. That was the whole week." });
  });

  it("orders mercy > monster > photo finish > dud", () => {
    const all = [
      final("TTT", 200, "TB", 150), // mercy (50) + monster (200)
      final("VV", 101, "FOO", 100), // photo (1)
      final("ROG", 120, "OMM", 80), // mercy 40 too, and a dud (80)
    ];
    expect(heroHeadlineLadder(recap(all)).map((l) => l.rung)).toEqual([
      "mercy",
      "monster",
      "photo-finish",
      "dud",
      "fallback",
    ]);
  });

  it("an ordinary week falls through to the slate, then the fallback", () => {
    const flat = [final("ROG", 130, "OMM", 120)];
    expect(heroHeadline(recap(flat))).toEqual({ rung: "fallback", text: HERO_FALLBACK_HEADLINE });
    expect(
      heroHeadline({
        ...recap(flat),
        slate: [game(W3.ROG, W3.OMM, { namedRivalry: { name: "The Custody Battle" } })],
      }).rung
    ).toBe("named-rivalry");
  });
});

describe("heroHeadline: slate-mode rungs", () => {
  const slate = (games: HeroSlateGame[], standings: HeroSlateTeam[]): HeroHeadlineInput => ({
    recapShown: false,
    priorFinals: W2_FINALS,
    slate: games,
    standings,
  });

  it("unbeaten clash only when the Game of the Week is two unbeatens, with the true count", () => {
    const standings = Object.values(W3);
    const g = [game(W3.TTT, W3.LDL, { isGameOfWeek: true }), game(W3.ROG, W3.OMM)];
    expect(heroHeadline(slate(g, standings))).toEqual({
      rung: "unbeaten-clash",
      text: "Four teams are 2-0. Two of them play each other this week.",
    });
    // Two unbeatens meeting off the featured card: no clash headline.
    const off = [game(W3.TTT, W3.LDL), game(W3.ROG, W3.OMM, { isGameOfWeek: true })];
    expect(heroHeadline(slate(off, standings)).rung).not.toBe("unbeaten-clash");
  });

  it("says 'Two teams' when the only two unbeatens meet", () => {
    const standings = [t("TTT", 3, 0), t("LDL", 3, 0), t("ROG", 2, 1), t("OMM", 1, 2)];
    const g = [game(standings[0], standings[1], { isGameOfWeek: true })];
    expect(heroHeadline(slate(g, standings)).text).toBe(
      "Two teams are 3-0, and they play each other this week."
    );
  });

  it("winless clash: two winless teams with the same record meet", () => {
    const g = [game(t("BCM", 0, 4), t("FOO", 0, 4))];
    expect(heroHeadline(slate(g, [])).text).toBe("Somebody is about to be 0-5.");
    // A tie on the books is not winless.
    expect(heroHeadline(slate([game(t("BCM", 0, 3, 1), t("FOO", 0, 4))], [])).rung).not.toBe(
      "winless-clash"
    );
  });

  it("division flip names the division, only once games are played", () => {
    const a = t("TTT", 3, 1);
    const b = t("LDL", 3, 1);
    const g = [game(a, b, { divisionName: "Division 1", canFlipDivisionLead: true, isGameOfWeek: true })];
    expect(heroHeadline(slate(g, [a, b]))).toEqual({
      rung: "division-flip",
      text: "The Tokyo Thunderbirds and Latter Day Lamb Special play for a share of Division 1.",
    });
    const z = [game(t("TTT", 0, 0), t("LDL", 0, 0), { divisionName: "Division 1", canFlipDivisionLead: true })];
    expect(heroHeadline({ ...slate(z, [t("TTT", 0, 0)]), priorFinals: [] }).rung).toBe("fallback");
  });

  it("named rivalry: says Game of the Week only when it is the featured game", () => {
    const featured = [game(W3.BCH, W3.WLD, { namedRivalry: { name: "The Custody Battle" }, isGameOfWeek: true })];
    expect(heroHeadline(slate(featured, [])).text).toBe("The Custody Battle is the Game of the Week.");
    const card = [game(W3.BCH, W3.WLD, { namedRivalry: { name: "The Custody Battle" } })];
    expect(heroHeadline(slate(card, [])).text).toBe("The Custody Battle is back on the slate.");
  });

  it("winless watch: the winless team facing the best record", () => {
    const g = [game(W3.TB, W3.BCH), game(W3.OMM, W3.ROG)];
    expect(heroHeadline(slate(g, []))).toEqual({
      rung: "winless-watch",
      text: "Of Mice and Mendoza is 0-2 and gets Real Olave Garden (2-0) next.",
    });
  });

  it("falls through to last week's finals, then the fallback", () => {
    expect(heroHeadline(slate([game(W3.BCH, W3.WLD)], [])).rung).toBe("mercy");
    expect(heroHeadline({ ...slate([game(W3.BCH, W3.WLD)], []), priorFinals: [] }).text).toBe(
      HERO_FALLBACK_HEADLINE
    );
  });
});

describe("hero copy hygiene", () => {
  it("no rung uses an em-dash, a stock idiom, or a day count", () => {
    const inputs: HeroHeadlineInput[] = [LIVE, { ...LIVE, recapShown: false }];
    for (const input of inputs) {
      for (const line of heroHeadlineLadder(input)) {
        expect(line.text).not.toMatch(/[—–]/);
        expect(line.text).not.toMatch(/days? (to|until) kickoff/i);
        const norm = normalize(line.text);
        for (const p of SIGNATURE_PHRASES) expect(norm, line.rung).not.toContain(p);
      }
    }
  });

  it("the dek fallback is null when only one rung fires", () => {
    const input: HeroHeadlineInput = {
      recapShown: true,
      priorFinals: [final("TTT", 170, "TB", 120)],
      slate: [],
      standings: [],
    };
    const h = heroHeadline(input);
    expect(h.rung).toBe("mercy");
    expect(heroDekFromData(input, h)).toBeNull();
  });
});

describe("heroKickerTail", () => {
  // Tue Sep 22 2026, 10:00 Central; kickoff Thu Sep 24 2026, 19:15 Central.
  const now = new Date("2026-09-22T15:00:00Z");
  const kickoff = new Date("2026-09-25T00:15:00Z");

  it("names the kickoff weekday in league time", () => {
    expect(heroKickerTail(kickoff, now)).toBe("Kickoff Thursday");
  });

  it("says today on kickoff day", () => {
    expect(heroKickerTail(kickoff, new Date("2026-09-24T18:00:00Z"))).toBe("Kickoff Today");
  });

  it("falls back to The Slate Is Set when unknown, past, or a week or more out", () => {
    expect(heroKickerTail(null, now)).toBe("The Slate Is Set");
    expect(heroKickerTail(kickoff, new Date("2026-09-26T00:00:00Z"))).toBe("The Slate Is Set");
    expect(heroKickerTail(new Date("2026-10-01T00:15:00Z"), now)).toBe("The Slate Is Set");
  });
});

describe("numeralSegments", () => {
  it("isolates decimals and records for the mono face", () => {
    expect(numeralSegments("Taking Boutte lost by 64.2. Four teams are 2-0.")).toEqual([
      { text: "Taking Boutte lost by ", numeral: false },
      { text: "64.2", numeral: true },
      { text: ". Four teams are ", numeral: false },
      { text: "2-0", numeral: true },
      { text: ".", numeral: false },
    ]);
  });
});

describe("finalsFromPairedMatchups", () => {
  const side = (id: Id, points: number, isWinner: boolean | null) => ({
    franchiseId: id,
    franchiseName: NAMES[id],
    points,
    isWinner,
  });

  it("uses Sleeper's winner flag and rounds the margin", () => {
    const out = finalsFromPairedMatchups([
      { status: "complete", homeTeam: side("TB", 140.78, false), awayTeam: side("TTT", 204.94, true) },
    ]);
    expect(out).toEqual([
      {
        winner: { franchiseId: "TTT", name: NAMES.TTT, points: 204.94 },
        loser: { franchiseId: "TB", name: NAMES.TB, points: 140.78 },
        margin: 64.2,
      },
    ]);
  });

  it("is empty unless every matchup is complete", () => {
    expect(
      finalsFromPairedMatchups([
        { status: "complete", homeTeam: side("TB", 1, false), awayTeam: side("TTT", 2, true) },
        { status: "in_progress", homeTeam: side("ROG", 1, null), awayTeam: side("BCM", 2, null) },
      ])
    ).toEqual([]);
    expect(finalsFromPairedMatchups([])).toEqual([]);
  });
});
