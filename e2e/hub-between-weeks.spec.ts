import { test, expect } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
import { signaturePhrasesIn } from "../lib/content-gen/phrases";
import { getSql } from "./helpers/sql";

// ============================================================================
// Between-Weeks Hub (state 1d)
//
// The Tue/Wed lull: regular season, no live game, the slate set but not yet
// kicked off. Runs under the "hub-in-season" Playwright project, whose dev
// server is pinned to NFL_STATE_OVERRIDE=regular:next:force (playwright.config.ts):
// "next" resolves per request to the earliest all-scheduled week.
// Bundled with #249's fix because it shares that server and had the same
// silent-skip defect (a runtime isBetweenWeeks() guard letting every test
// self-skip with zero assertions exercised).
//
// The distinctive marker is the hero kicker's schedule clause: "... KICKOFF
// THURSDAY" (the slate's first kickoff day), "KICKOFF TODAY", or "THE SLATE IS
// SET" when the kickoff is unknown. The first
// test below asserts it unconditionally, making the state itself a hard claim
// rather than an implicit one; every other test in the file also asserts
// unconditionally now.
//
// Fallback documented in the PR: if the forced regular:next:force state does not
// land the hub in the between-weeks sub-state (computeIsBetweenWeeks needs a
// slate with no kicked-off games), this file is dropped from the
// hub-in-season project's testMatch and from STATE_FORCED in
// playwright.config.ts rather than fought.
// ============================================================================

const SLATE_MARKER =
  /WEEK \d+ · (KICKOFF (MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|TODAY)|THE SLATE IS SET)/i;

/** The between-weeks hero is the first section in <main>. */
function hero(page: Page): Locator {
  return page.locator("main section").first();
}

test.describe("Between-Weeks Hub (1d)", () => {
  test("T00: the between-weeks slate marker renders", async ({ page }) => {
    await page.goto("/");
    const kicker = (await page.getByTestId("hero-kicker").innerText()).trim();
    expect(kicker).toMatch(SLATE_MARKER);
  });

  // Blake: "Two days to kickoff." was awful to read. The headline is now a
  // take built from the league's own results (lib/hub/hero-headline.ts), and
  // the day moved to the kicker. On this server the recap is not forced, so
  // the slate rungs lead; each is checked against what the page itself shows.
  test("T25: the hero headline is a data-derived take, never a day count", async ({ page }) => {
    await page.goto("/");
    const h1 = page.getByTestId("hero-headline");
    const text = (await h1.innerText()).trim();
    const rung = await h1.getAttribute("data-hero-rung");
    expect(text).not.toMatch(/days? (to|until) kickoff|kickoff is (today|tomorrow)/i);
    expect(text).not.toMatch(/[—–]/);
    expect(rung).toMatch(
      /^(mercy|monster|photo-finish|dud|unbeaten-clash|winless-clash|division-flip|named-rivalry|winless-watch|fallback)$/
    );
    if (rung === "fallback") expect(text).toBe("The slate is set.");

    // The headline is one serif run: no numeral is swapped into the mono
    // face mid-sentence (an upright mono figure inside italic serif broke
    // the line).
    await expect(h1.locator("span.font-mono")).toHaveCount(0);

    // The claims are checkable against the page.
    const main = (await page.locator("main").innerText()).toUpperCase();
    if (rung === "named-rivalry") {
      const name = /^(.+) is (the Game of the Week|back on the slate)\.$/.exec(text)?.[1];
      expect(name, text).toBeTruthy();
      // The rivalry's name renders on its card too (kicker or slate angle).
      expect(main.split(name!.toUpperCase()).length - 1).toBeGreaterThanOrEqual(2);
    }
    if (rung === "winless-watch") {
      const m = /^(.+) is (0-\d+) and gets (.+) \((\d+-\d+(?:-\d+)?)\) next\.$/.exec(text);
      expect(m, text).not.toBeNull();
    }
    if (rung === "unbeaten-clash") {
      const kicker = (await page.getByTestId("gotw-kicker").innerText()).trim();
      expect(kicker).toMatch(/BATTLE OF UNBEATENS|DIVISION LEAD ON THE LINE|PLAYOFF SPOT|TOP-THREE/);
    }
  });

  test("T01: hero renders the slate kicker and a serif headline", async ({
    page,
  }) => {
    await page.goto("/");

    const h = hero(page);
    await expect(h.locator("p.text-kicker").first()).toContainText(
      /Harambe Memorial League/i
    );
    const h1 = h.locator("h1");
    await expect(h1).toBeVisible();
    expect((await h1.innerText()).trim().length).toBeGreaterThan(0);
    // Serif italic display family.
    const fontStyle = await h1.evaluate((el) => getComputedStyle(el).fontStyle);
    expect(fontStyle).toBe("italic");
  });

  test("T02: Game of the Week feature card is present with both teams", async ({
    page,
  }) => {
    await page.goto("/");

    const gotwLabel = page.getByText("Game of the Week", { exact: true });
    await expect(gotwLabel).toBeVisible();
    // The card carries a serif "vs" between the two teams.
    await expect(page.getByText("vs", { exact: true }).first()).toBeVisible();
  });

  test("T03: the rest of the slate section renders preview cards", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("The Rest of the Slate", { exact: true })
    ).toBeVisible();
  });

  test("T11: every slate card carries its own angle, never the 0-0 placeholder", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("The Rest of the Slate", { exact: true })
    ).toBeVisible();

    const angles = (
      await page.getByTestId("slate-angle").allInnerTexts()
    ).map((a) => a.trim());

    // The slate is the whole week minus the Game of the Week, so a real week
    // always has several cards.
    expect(angles.length).toBeGreaterThanOrEqual(2);

    // AC 2: no two cards say the same thing.
    expect(new Set(angles).size).toBe(angles.length);

    for (const angle of angles) {
      // AC 1: never the records placeholder, and never a 0-0 claim at all.
      expect(angle).not.toMatch(/\d+-\d+ against \d+-\d+/);
      expect(angle).not.toContain("0-0");
      // Substantive copy, not a bare fragment.
      expect(angle.length).toBeGreaterThan(20);
    }
  });

  // Issue #274: the hero dek, the Game of the Week kicker and the Game of the
  // Week blurb are three generated lines stacked on one screen. They used to
  // share stock idioms ("receipts to settle", "first place on the line"),
  // which made them read as one fill-in-the-blank template.
  test("T12: hero dek, GotW kicker and GotW blurb share no signature phrase", async ({
    page,
  }) => {
    await page.goto("/");

    const dek = (await page.getByTestId("hero-dek").innerText()).trim();
    const kicker = (await page.getByTestId("gotw-kicker").innerText()).trim();
    const blurb = (await page.getByTestId("gotw-blurb").innerText()).trim();

    for (const line of [dek, kicker, blurb]) {
      expect(line.length).toBeGreaterThan(0);
    }

    const pairs: [string, string, string][] = [
      ["dek/kicker", dek, kicker],
      ["dek/blurb", dek, blurb],
      ["kicker/blurb", kicker, blurb],
    ];
    for (const [label, a, b] of pairs) {
      const shared = [...signaturePhrasesIn(a)].filter((p) =>
        signaturePhrasesIn(b).has(p)
      );
      expect(shared, `${label} share: ${shared.join(", ")}`).toEqual([]);
    }

    // Deliberately NOT asserting literal copy here: the blurb is generated
    // (or seeded from the opener variant, which says nothing about first
    // place because nobody has a record yet), so pinning its words would
    // fail for a correct page. The invariant is that all three lines are
    // real and none of them echo each other; the exact wording of the GotW
    // line is pinned in lib/content-gen/templates.test.ts, where the input
    // is controlled.
    expect(blurb.length).toBeGreaterThan(20);
  });

  // The Game of the Week kicker used to say "DIVISION LEAD AT STAKE" whenever
  // either team led its division, including a 2-0 team against an 0-2 team
  // with every other division-mate at 0-2 (the lead could not change hands).
  // It now says "Division lead on the line" only for a division game the
  // underdog can win its way to the top of. The full proof needs the whole
  // division, but one necessary condition is checkable from the two records
  // the card prints: if the trailing team wins, it must at least draw level
  // with the leading team on win%. A kicker that fails that is false.
  test("T22: the kicker only claims a division lead the two records make possible", async ({
    page,
  }) => {
    await page.goto("/");
    const kicker = (await page.getByTestId("gotw-kicker").innerText()).trim();
    expect(kicker.length).toBeGreaterThan(0);

    const gotwHeading = page.getByText("Game of the Week", { exact: true });
    const card = gotwHeading.locator("xpath=following-sibling::*[1]");
    const records = (await card.locator("span.text-stat").allInnerTexts())
      .map((r) => r.trim())
      .filter((r) => /^\d+-\d+(-\d+)?$/.test(r));
    expect(records).toHaveLength(2);

    const parse = (r: string) => {
      const [w, l, t = 0] = r.split("-").map(Number);
      return { w, l, t };
    };
    const pct = (x: { w: number; l: number; t: number }) => {
      const g = x.w + x.l + x.t;
      return g === 0 ? 0 : (x.w + x.t / 2) / g;
    };
    const [a, b] = records.map(parse);

    if (/division lead/i.test(kicker)) {
      // A division game, never a cross-division one. A named rivalry leads
      // with its own name instead of the division (T24 pins that shape).
      const rivalry = await page.getByTestId("gotw-kicker").getAttribute("data-named-rivalry");
      if (rivalry) {
        expect(kicker).toBe(`${rivalry.toUpperCase()} · DIVISION LEAD ON THE LINE`);
      } else {
        expect(kicker).toMatch(/^DIVISION \d+ (REMATCH|GAME) · /);
      }
      // Games have been played: a 0-0 record leads nothing.
      expect(a.w + a.l + a.t + b.w + b.l + b.t).toBeGreaterThan(0);
      // Either side, winning, draws level with the other side losing.
      for (const [x, y] of [
        [a, b],
        [b, a],
      ]) {
        expect(pct({ ...x, w: x.w + 1 })).toBeGreaterThanOrEqual(pct({ ...y, l: y.l + 1 }));
      }
    }

    // The retired stakes wording and a 0-0 "lead" never render.
    expect(kicker).not.toMatch(/DIVISION LEAD AT STAKE/);
  });

  test("T24: a commish-named rivalry leads the GotW kicker, with its tagline aside", async ({
    page,
  }) => {
    await page.goto("/");
    const kickerEl = page.getByTestId("gotw-kicker");
    const kicker = (await kickerEl.innerText()).trim();
    // Shape either way: exactly "{lead} · {stakes}", both clauses non-empty.
    expect(kicker).toMatch(/^[^·]+\S · \S[^·]+$/);

    // The featured pair, read off the card's two team links.
    const gotwHeading = page.getByText("Game of the Week", { exact: true });
    const card = gotwHeading.locator("xpath=following-sibling::*[1]");
    const slugs = (await card.locator('a[href^="/teams/"]').evaluateAll((els) =>
      els.map((el) => (el.getAttribute("href") ?? "").split("/")[2])
    )).filter(Boolean);
    expect(new Set(slugs).size).toBe(2);
    const [s1, s2] = [...new Set(slugs)];

    // Every named rivalry in the live DB, with its pair's slugs.
    const sql = getSql();
    const rows = (await sql`
      SELECT r.name, r.tagline, fa.slug AS a_slug, fb.slug AS b_slug
      FROM rivalries r
      JOIN franchises fa ON fa.id = r.franchise_a_id
      JOIN franchises fb ON fb.id = r.franchise_b_id
    `) as { name: string; tagline: string | null; a_slug: string; b_slug: string }[];
    const featured = rows.find(
      (r) => (r.a_slug === s1 && r.b_slug === s2) || (r.a_slug === s2 && r.b_slug === s1)
    );

    const attr = await kickerEl.getAttribute("data-named-rivalry");
    const tagline = page.getByTestId("gotw-rivalry-tagline");
    const leadsWithSomeRivalry = rows.some((r) =>
      kicker.startsWith(`${r.name.toUpperCase()} · `)
    );
    const isTitleRematch = /REMATCH ·/.test(kicker) && /BOWL|TITLE GAME/.test(kicker);

    if (featured && !isTitleRematch) {
      // The featured game IS a named rivalry (at weight 12 that takes a real
      // game, not just a name: the 2-0 v 0-2 Custody Battle stays a slate card
      // in week 3): its name leads the kicker, the second
      // clause is a real fact, and the tagline sits under it in the serif.
      expect(attr).toBe(featured.name);
      expect(kicker.startsWith(`${featured.name.toUpperCase()} · `)).toBe(true);
      const second = kicker.slice(featured.name.length + 3);
      expect(second).toMatch(
        /^(\d+-\d+(-\d+)? MEETS \d+-\d+(-\d+)?|DIVISION LEAD ON THE LINE|PLAYOFF SPOT AT STAKE|BATTLE OF UNBEATENS|TOP-THREE CLASH|CROSS-DIVISION|DIVISION \d+ (GAME|REMATCH))$/
      );
      if (featured.tagline) {
        await expect(tagline).toHaveText(featured.tagline);
        const fontStyle = await tagline.evaluate((el) => getComputedStyle(el).fontStyle);
        expect(fontStyle).toBe("italic");
      } else {
        await expect(tagline).toHaveCount(0);
      }
      // The blurb names the rivalry too, unless a stored LLM blurb for this
      // exact pair replaced the reason-derived one; either way it never
      // echoes the tagline the card already prints.
      const blurb = (await page.getByTestId("gotw-blurb").innerText()).trim();
      if (featured.tagline) expect(blurb).not.toContain(featured.tagline);
    } else {
      // Not a named rivalry: no rivalry name leads, and no tagline renders.
      expect(attr).toBeNull();
      expect(leadsWithSomeRivalry).toBe(false);
      await expect(tagline).toHaveCount(0);
    }

    // A named rivalry that did NOT take the top card still carries its name
    // and tagline on its slate card (the builder's rivalry rung always beats
    // a stored generated angle for a named pair).
    for (const card of await page.getByTestId("slate-card").all()) {
      const cardSlugs = new Set(
        (await card.locator('a[href^="/teams/"]').evaluateAll((els) =>
          els.map((el) => (el.getAttribute("href") ?? "").split("/")[2])
        )).filter(Boolean)
      );
      const named = rows.find((r) => cardSlugs.has(r.a_slug) && cardSlugs.has(r.b_slug));
      if (!named) continue;
      const angle = (await card.getByTestId("slate-angle").innerText()).trim();
      expect(angle.startsWith(`${named.name}: `), angle).toBe(true);
      if (named.tagline) expect(angle).toContain(named.tagline);
    }
  });

  test("T23: the GotW blurb and headline assert nothing they cannot prove", async ({ page }) => {
    await page.goto("/");
    const blurb = (await page.getByTestId("gotw-blurb").innerText()).trim();
    // The old template, seed and any legacy stored row said all of this about
    // every featured game. A stored blurb now renders only when its ref_key
    // names the featured pair; otherwise the reason-derived blurb does.
    expect(blurb).not.toMatch(/first place|receipts to settle|thursday night/i);

    const headline = (await page.locator("main section").first().locator("h1").innerText()).trim();
    expect(headline).not.toMatch(/matters again/i);

    // Not asserted here: the slate ladder's retired "still on the books"
    // tail. Stored matchup_angle rows written by the old template keep
    // rendering until the next generate-content run replaces them, so a
    // page-level check would test the database, not this code. The builder
    // itself is pinned in lib/hub/slate-angle.test.ts.
  });

  test("T04: no em-dashes anywhere in the hub copy", async ({ page }) => {
    await page.goto("/");
    const text = await page.locator("main").innerText();
    expect(text).not.toContain("—"); // em dash
    expect(text).not.toContain("–"); // en dash
  });

  test("T06: pre-kickoff rail shows Players to Watch, never Standouts", async ({
    page,
  }) => {
    await page.goto("/");
    const main = page.locator("main");
    const text = await main.innerText();
    expect(text).not.toContain("Standouts");
    // Only assert the heading exists when the rail actually has picks; an
    // empty result renders nothing, which is also correct behavior.
    const hasPlayersToWatch = /Players to Watch/i.test(text);
    if (hasPlayersToWatch) {
      await expect(
        page.getByText(/Players to Watch/i).first()
      ).toBeVisible();
      // Every pick carries a story kicker: the headliner, or one of the
      // archetype slots (see lib/queries/players-to-watch.ts).
      // Case-insensitive: the kicker line renders through CSS `uppercase`,
      // and innerText returns the rendered casing.
      expect(text).toMatch(
        /The Headliner|The Debut|Revenge Game|New Face|The Leap/i
      );
    }
  });

  test("T09: the rail reads the league's own data, never Sleeper trending", async ({
    page,
  }) => {
    await page.goto("/");
    const text = await page.locator("main").innerText();
    // The Trending module is gone; the hub makes no live Sleeper call.
    expect(text).not.toContain("Most-added player in the league");
    // League Moves and the history card are both optional (empty renders
    // nothing), so assert their shape only when they are on the page.
    if (/League Moves/i.test(text)) {
      expect(text).toMatch(/\bADD\b|\bDROP\b|\bTRADE\b/);
      const card = page
        .locator("section", { has: page.getByText("League Moves", { exact: true }) })
        .first();
      // The player is the focal, clickable identity: at least one row links
      // through to its player page.
      await expect(
        card.locator('a[href^="/players/"]').first()
      ).toBeVisible();
      // Every row draws either a real headshot from the Sleeper CDN or the
      // initials monogram fallback, never a bare franchise crest as the lead.
      const hasHeadshot = await card
        .locator('img[src*="sleepercdn.com/content/nfl/players"]')
        .first()
        .isVisible()
        .catch(() => false);
      const hasMonogram = await card
        .getByText(/^[A-Z]{1,2}$/)
        .first()
        .isVisible()
        .catch(() => false);
      expect(hasHeadshot || hasMonogram).toBe(true);
      // The fantasy franchise stays visible as secondary attribution: the
      // kind label ("ADD"/"DROP"/"TRADE") sits on a row with the franchise
      // name trailing it, so that row's text is more than the kind alone.
      const kindSpan = card.getByText(/^(ADD|DROP|TRADE)$/).first();
      const kindRowText = await kindSpan.locator("xpath=..").innerText();
      expect(kindRowText.trim().length).toBeGreaterThan(4);
    }
    if (/This Week in HMLML History/i.test(text)) {
      // Case-insensitive for the same CSS `uppercase` reason as T06.
      expect(text).toMatch(/High Water|Beatdown|Nail-Biter/i);
    }
  });

  test("T07: no duplicate <h2> section headings in <main>", async ({ page }) => {
    await page.goto("/");
    const headings = await page.locator("main h2").allInnerTexts();
    const normalized = headings.map((h) => h.trim()).filter(Boolean);
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  test("T08: no fabricated division-leader claim while the Game of the Week teams are both 0-0", async ({
    page,
  }) => {
    await page.goto("/");
    // Scope to the Game of the Week card's own season records (not the
    // all-time head-to-head badge, which is a different, always-nonzero
    // number even at week 1): both teams reading 0-0 there means the league
    // has played zero games, so no "1st in Division" claim should exist
    // anywhere in <main>.
    const gotwHeading = page.getByText("Game of the Week", { exact: true });
    await expect(gotwHeading).toBeVisible();
    const gotwCard = gotwHeading.locator("xpath=following-sibling::*[1]");
    const recordSpans = gotwCard.locator("span.text-stat");
    const records = await recordSpans.allInnerTexts();
    const seasonRecords = records.filter((r) => /^\d+-\d+$/.test(r.trim()));
    const bothZero =
      seasonRecords.length >= 2 && seasonRecords.every((r) => r.trim() === "0-0");
    if (bothZero) {
      const text = await page.locator("main").innerText();
      expect(text).not.toContain("1st in Division");
    }
  });

  test("T10: rail story text wraps instead of clipping, at desktop and mobile widths", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      const main = page.locator("main");
      const text = await main.innerText();

      // Players to Watch: story-detail and projection paragraphs.
      if (/Players to Watch/i.test(text)) {
        // data-testid, not literal Tailwind class strings: the class-based
        // selector this used to carry went stale the moment the spacing pass
        // changed a clamp, and the `for i < count` loop below passes silently
        // at count 0, so the assertion vanished without failing. The explicit
        // count check is the guard against that recurring.
        const storyParagraphs = page.locator(
          '[data-testid="ptw-story"], [data-testid="ptw-projected"]'
        );
        const count = await storyParagraphs.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          const el = storyParagraphs.nth(i);
          const { scrollWidth, clientWidth, fontSize, textTransform } =
            await el.evaluate((node) => {
              const style = getComputedStyle(node);
              return {
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth,
                fontSize: parseFloat(style.fontSize),
                textTransform: style.textTransform,
              };
            });
          expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
          expect(fontSize).toBeGreaterThanOrEqual(14);
          expect(textTransform).toBe("none");
        }
      }

      // This Week in HMLML History: the claim paragraph.
      if (/This Week in HMLML History/i.test(text)) {
        const claimParagraphs = page.locator('[data-testid="week-history-claim"]');
        const count = await claimParagraphs.count();
        expect(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++) {
          const el = claimParagraphs.nth(i);
          const { scrollWidth, clientWidth, fontSize, textTransform } =
            await el.evaluate((node) => {
              const style = getComputedStyle(node);
              return {
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth,
                fontSize: parseFloat(style.fontSize),
                textTransform: style.textTransform,
              };
            });
          expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
          expect(fontSize).toBeGreaterThanOrEqual(14);
          expect(textTransform).toBe("none");
        }
      }
    }
  });

  test("T05: mobile keeps the top of the funnel and hides the rail", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // Hero + Game of the Week visible on mobile.
    await expect(hero(page).locator("h1")).toBeVisible();
    await expect(page.getByText("Game of the Week", { exact: true })).toBeVisible();

    // Right-rail modules (League Moves, This Week in HMLML History) are
    // desktop-only. Left On The Bench is too, EXCEPT while the post-week recap
    // leads the hub: #300 moved it into the recap in the main column so phones
    // see it, and there it must be visible.
    const recapLeads = (await page.getByTestId("week-recap").count()) > 0;
    const bench = page.getByText("Left On The Bench", { exact: true });
    if (recapLeads) {
      await expect(page.getByTestId("week-recap").getByText("Left On The Bench", { exact: true })).toBeVisible();
    } else {
      await expect(bench).toBeHidden();
    }
    await expect(page.getByText("League Moves", { exact: true })).toBeHidden();
    await expect(
      page.getByText("This Week in HMLML History", { exact: true })
    ).toBeHidden();

    // Page does not scroll horizontally.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(overflow).toBe(true);
  });

  // --------------------------------------------------------------------
  // Power Rankings preview (#277)
  // --------------------------------------------------------------------

  test("T16: power rankings preview renders on the between-weeks hub", async ({
    page,
  }) => {
    await page.goto("/");

    const link = page.locator('a[href="/records/power-rankings"]');
    await expect(link.first()).toBeVisible();

    // Walk up to the module's card and assert it holds at least 3 ranked
    // rows, each carrying a real franchise name (never a bare letter code).
    const card = page.locator("section", { has: link.first() }).last();
    const rows = card.locator('a[href^="/teams/"]');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < rowCount; i++) {
      const text = (await rows.nth(i).innerText()).trim();
      expect(text.length).toBeGreaterThan(2);
    }
  });

  test("T17: the module names its edition honestly", async ({ page }) => {
    await page.goto("/");

    const main = page.locator("main");
    const text = await main.innerText();

    expect(text).toMatch(/Power Rankings|Preseason Power/i);

    const isPreseason = /Preseason Power/i.test(text);
    if (isPreseason) {
      expect(text).toMatch(/Real rankings land after Week 1/i);
    } else {
      // Regular edition: at least one mover glyph on the page (riser/faller
      // strip), though either half may be absent if nobody moved.
      expect(text).toMatch(/Riser|Faller/i);
    }
  });

  test("T18: the module links through to the full rankings page", async ({
    page,
  }) => {
    await page.goto("/");

    const link = page.locator('a[href="/records/power-rankings"]').first();
    await expect(link).toBeVisible();
    await link.click();

    await page.waitForURL(/\/records\/power-rankings/);
    await expect(page.getByText("Power Rankings.", { exact: true })).toBeVisible();
  });

  test("T19: every rank number renders in the mono numeral face", async ({
    page,
  }) => {
    await page.goto("/");

    const link = page.locator('a[href="/records/power-rankings"]').first();
    await expect(link).toBeVisible();
    const card = page.locator("section", { has: link }).last();
    const rankCell = card.locator('a[href^="/teams/"] span.font-mono').first();
    await expect(rankCell).toBeVisible();

    const fontFamily = await rankCell.evaluate(
      (el) => getComputedStyle(el).fontFamily
    );
    expect(fontFamily).toMatch(/JetBrains/i);
  });

  test("T20: sibling slate cards in a row share a height and a footer baseline", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const cards = page.locator('[data-testid="slate-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);

    // Group by rounded y: the slate is a 2-up grid, so each y is one row.
    const rows = new Map<number, { height: number; footerY: number | null }[]>();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      const footer = card.locator('[data-testid="slate-footer"]');
      const footerBox = (await footer.count()) ? await footer.boundingBox() : null;
      const key = Math.round(box!.y);
      const bucket = rows.get(key) ?? [];
      bucket.push({ height: box!.height, footerY: footerBox?.y ?? null });
      rows.set(key, bucket);
    }

    let comparedRows = 0;
    let comparedFooters = 0;
    for (const bucket of rows.values()) {
      if (bucket.length < 2) continue;
      comparedRows++;
      const first = bucket[0];
      for (const card of bucket) {
        // Content-driven jitter (a two-line angle beside a one-line one) is
        // exactly what this must catch, so the tolerance is 1px, not "close".
        expect(Math.abs(card.height - first.height)).toBeLessThanOrEqual(1);
      }

      // ... and the Book footers sit on one baseline, which is the part
      // grid stretch alone does not give you (the footer used to float off
      // the angle, so a shorter card left ragged dead space beneath it).
      const footerYs = bucket
        .map((c) => c.footerY)
        .filter((y): y is number => y !== null);
      if (footerYs.length > 1) {
        comparedFooters++;
        for (const y of footerYs) {
          expect(Math.abs(y - footerYs[0])).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(comparedRows).toBeGreaterThan(0);
    // Same guard as the count check in T10: without it, a slate that stopped
    // rendering Book footers would take the `length > 1` branch zero times and
    // this test would report green having compared nothing.
    expect(comparedFooters).toBeGreaterThan(0);
  });

  test("T21: every rail card uses the one row rhythm", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const stacks = page.locator('[data-testid="rail-rows"]');
    const stackCount = await stacks.count();
    expect(stackCount).toBeGreaterThan(0);

    for (let s = 0; s < stackCount; s++) {
      const rows = stacks.nth(s).locator("> *");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
      for (let i = 0; i < rowCount; i++) {
        const { paddingTop, paddingBottom } = await rows.nth(i).evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            paddingTop: style.paddingTop,
            paddingBottom: style.paddingBottom,
          };
        });
        expect(paddingTop).toBe(i === 0 ? "0px" : "16px");
        expect(paddingBottom).toBe(i === rowCount - 1 ? "0px" : "16px");
      }
    }
  });
});
