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
// The distinctive marker is the slate meta on the Game of the week label row
// (the hero lost its kicker in the 2026-11-24 UI/UX pass): "Week 12 · Kickoff
// Thursday" (the slate's first kickoff day), "Kickoff today", or "The slate is
// set" when the kickoff is unknown. The first
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

/**
 * Opens every visible "More this week" disclosure row so its content is
 * rendered (Players to watch on phones, League moves, This week in history).
 * Returns how many rows it opened.
 */
async function openMoreThisWeek(page: Page): Promise<number> {
  const rows = page.locator('details[data-testid^="more-"]');
  let opened = 0;
  for (const row of await rows.all()) {
    if (!(await row.isVisible())) continue;
    await row.locator("summary").click();
    await expect(row).toHaveAttribute("open", "");
    opened++;
  }
  return opened;
}

test.describe("Between-Weeks Hub (1d)", () => {
  test("T00: the between-weeks slate marker renders", async ({ page }) => {
    await page.goto("/");
    const meta = (await page.getByTestId("slate-meta").innerText()).trim();
    expect(meta).toMatch(SLATE_MARKER);
    // No kicker stacked above the headline any more.
    await expect(page.getByTestId("hero-kicker")).toHaveCount(0);
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
      // The rivalry's name renders on its card too (title or slate angle).
      expect(main.split(name!.toUpperCase()).length - 1).toBeGreaterThanOrEqual(2);
    }
    if (rung === "winless-watch") {
      const m = /^(.+) is (0-\d+) and gets (.+) \((\d+-\d+(?:-\d+)?)\) next\.$/.exec(text);
      expect(m, text).not.toBeNull();
    }
    if (rung === "unbeaten-clash") {
      const kicker = (await page.getByTestId("gotw-kicker").getAttribute("data-kicker")) ?? "";
      expect(kicker).toMatch(/BATTLE OF UNBEATENS|DIVISION LEAD ON THE LINE|PLAYOFF SPOT|TOP-THREE/i);
    }
  });

  test("T01: hero is an upright serif headline with no kicker above it", async ({
    page,
  }) => {
    await page.goto("/");

    const h = hero(page);
    await expect(h.locator(".text-kicker")).toHaveCount(0);
    const h1 = h.locator("h1");
    await expect(h1).toBeVisible();
    expect((await h1.innerText()).trim().length).toBeGreaterThan(0);
    // Serif display family, upright (italic stays only on the wordmark).
    const { fontStyle, fontFamily } = await h1.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fontStyle: cs.fontStyle, fontFamily: cs.fontFamily };
    });
    expect(fontStyle).toBe("normal");
    expect(fontFamily).toMatch(/Instrument Serif/i);
  });

  test("T26: signed out, the hero offers one primary action: Claim your team", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const cta = hero(page).getByTestId("hero-claim-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveText(/Claim your team/);
    await expect(cta).toHaveAttribute("href", "/claim");
    const box = await cta.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // The quiet companion goes to last week's box scores.
    await expect(
      hero(page).getByRole("link", { name: "Box scores", exact: true })
    ).toHaveAttribute("href", /^\/seasons\/\d{4}\/week\/\d+$/);
  });

  test("T02: Game of the Week feature card is present with both teams", async ({
    page,
  }) => {
    await page.goto("/");

    const gotwLabel = page.getByText("Game of the week", { exact: true });
    await expect(gotwLabel).toBeVisible();
    // The gold title is upright serif; the card carries a "vs" between the teams.
    const title = page.getByTestId("gotw-title");
    await expect(title).toBeVisible();
    expect(await title.evaluate((el) => getComputedStyle(el).fontStyle)).toBe("normal");
    await expect(page.getByText("vs", { exact: true }).first()).toBeVisible();
  });

  test("T03: every rest-of-slate row is one 44px link into The Book", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("Rest of the slate", { exact: true })
    ).toBeVisible();
    const rows = page.getByTestId("slate-card");
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
    for (const row of await rows.all()) {
      expect(await row.evaluate((el) => el.tagName)).toBe("A");
      await expect(row).toHaveAttribute("href", "/book");
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      // A ChevronRight icon, not a "→" text arrow.
      await expect(row.locator("svg")).toHaveCount(1);
      expect(await row.innerText()).not.toContain("→");
      // Letters stay Geist: the angle is not set in the serif.
      const angleFont = await row
        .getByTestId("slate-angle")
        .evaluate((el) => getComputedStyle(el).fontFamily);
      expect(angleFont).not.toMatch(/Instrument Serif/i);
    }
  });

  test("T11: every slate card carries its own angle, never the 0-0 placeholder", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("Rest of the slate", { exact: true })
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
    const kicker = ((await page.getByTestId("gotw-kicker").getAttribute("data-kicker")) ?? "").trim();
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
    // The full "{lead} · {stakes}" string rides on data-kicker (the card shows
    // the lead as its title and the stakes under it); upper-cased so the
    // casing-agnostic assertions below read as they always have.
    const kicker = ((await page.getByTestId("gotw-kicker").getAttribute("data-kicker")) ?? "")
      .trim()
      .toUpperCase();
    expect(kicker.length).toBeGreaterThan(0);

    const card = page.getByTestId("gotw-kicker").locator("xpath=ancestor::div[contains(@class,'card-surface')][1]");
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
    const kicker = ((await kickerEl.getAttribute("data-kicker")) ?? "").trim().toUpperCase();
    // Shape either way: exactly "{lead} · {stakes}", both clauses non-empty.
    expect(kicker).toMatch(/^[^·]+\S · \S[^·]+$/);

    // The featured pair, read off the card's two team links.
    const card = kickerEl.locator("xpath=ancestor::div[contains(@class,'card-surface')][1]");
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
      // clause is a real fact, and the tagline sits under it in upright Geist.
      expect(attr).toBe(featured.name);
      expect(kicker.startsWith(`${featured.name.toUpperCase()} · `)).toBe(true);
      const second = kicker.slice(featured.name.length + 3);
      expect(second).toMatch(
        /^(\d+-\d+(-\d+)? MEETS \d+-\d+(-\d+)?|DIVISION LEAD ON THE LINE|PLAYOFF SPOT AT STAKE|BATTLE OF UNBEATENS|TOP-THREE CLASH|CROSS-DIVISION|DIVISION \d+ (GAME|REMATCH))$/
      );
      if (featured.tagline) {
        await expect(tagline).toHaveText(featured.tagline);
        const fontStyle = await tagline.evaluate((el) => getComputedStyle(el).fontStyle);
        expect(fontStyle).toBe("normal");
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
    // Slate rows are one link into The Book (no nested team links), so the
    // pair rides on data-team-slugs.
    for (const card of await page.getByTestId("slate-card").all()) {
      const cardSlugs = new Set(
        ((await card.getAttribute("data-team-slugs")) ?? "").split(" ").filter(Boolean)
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
    await openMoreThisWeek(page);
    const main = page.locator("main");
    const text = await main.innerText();
    expect(text).not.toContain("Standouts");
    // Only assert the heading exists when the rail actually has picks; an
    // empty result renders nothing, which is also correct behavior.
    const hasPlayersToWatch = /Players to watch/i.test(text);
    if (hasPlayersToWatch) {
      await expect(
        page.getByText(/Players to watch/i).filter({ visible: true }).first()
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
    await openMoreThisWeek(page);
    const text = await page.locator("main").innerText();
    // The Trending module is gone; the hub makes no live Sleeper call.
    expect(text).not.toContain("Most-added player in the league");
    // League Moves and the history card are both optional (empty renders
    // nothing), so assert their shape only when they are on the page.
    if (await page.getByTestId("more-league-moves").count()) {
      expect(text).toMatch(/\bAdd\b|\bDrop\b|\bTrade\b/);
      const card = page.getByTestId("more-league-moves");
      // The player is the focal, clickable identity: at least one row links
      // through to its player page.
      await expect(
        card.locator('a[href^="/players/"]').first()
      ).toBeVisible();
      // Every row draws either a real headshot from the Sleeper CDN or the
      // initials monogram fallback, never a bare franchise crest as the lead.
      const hasHeadshot = await card
        // next/image proxies the CDN, so the src is URL-encoded
        // (/_next/image?url=https%3A%2F%2Fsleepercdn.com%2Fcontent...).
        .locator(
          'img[src*="sleepercdn.com/content/nfl/players"], img[src*="sleepercdn.com%2Fcontent%2Fnfl%2Fplayers"]'
        )
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
      // kind label ("Add"/"Drop"/"Trade", sentence case) sits on a row with
      // the franchise name trailing it, so that row's text is more than the
      // kind alone.
      await expect(card.getByTestId("move-kind").first()).toHaveText(/^(Add|Drop|Trade)$/);
      const kindRowText = await card.getByTestId("move-kind-row").first().innerText();
      expect(kindRowText.trim().length).toBeGreaterThan(4);
    }
    if (await page.getByTestId("more-week-history").count()) {
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
    const gotwHeading = page.getByText("Game of the week", { exact: true });
    await expect(gotwHeading).toBeVisible();
    const gotwCard = page
      .getByTestId("gotw-kicker")
      .locator("xpath=ancestor::div[contains(@class,'card-surface')][1]");
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
      await openMoreThisWeek(page);
      const main = page.locator("main");
      const text = await main.innerText();

      // Players to watch: story-detail and projection paragraphs. Desktop
      // shows them in the rail, phones inside the opened "More this week" row;
      // only the copy actually on screen is measured.
      if (/Players to watch/i.test(text)) {
        // data-testid, not literal Tailwind class strings: the class-based
        // selector this used to carry went stale the moment the spacing pass
        // changed a clamp, and the `for i < count` loop below passes silently
        // at count 0, so the assertion vanished without failing. The explicit
        // count check is the guard against that recurring.
        const storyParagraphs = page
          .locator('[data-testid="ptw-story"], [data-testid="ptw-projected"]')
          .filter({ visible: true });
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

      // This week in history: the claim paragraph.
      if (await page.getByTestId("more-week-history").count()) {
        const claimParagraphs = page
          .locator('[data-testid="week-history-claim"]')
          .filter({ visible: true });
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

  test("T05: mobile keeps the top of the funnel and folds the secondary modules", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    // Hero + Game of the week visible on mobile.
    await expect(hero(page).locator("h1")).toBeVisible();
    await expect(page.getByText("Game of the week", { exact: true })).toBeVisible();

    // The desktop rail is hidden; its bench fallback never shows on a phone.
    await expect(page.getByText("Left on the bench", { exact: true })).toBeHidden();

    // Players to watch, League moves and This week in history are NOT
    // rendered inline: each is a closed "More this week" row whose content
    // shows only once opened.
    const more = page.locator('details[data-testid^="more-"]');
    const n = await more.count();
    if (n > 0) {
      await expect(page.getByText("More this week", { exact: true })).toBeVisible();
      for (const row of await more.all()) {
        expect(await row.getAttribute("open")).toBeNull();
        const summary = row.locator("summary");
        expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await expect(page.getByTestId("week-history-claim").first()).toBeHidden();
      await openMoreThisWeek(page);
      const history = page.getByTestId("more-week-history");
      if (await history.count()) {
        await expect(history.getByTestId("week-history-claim").first()).toBeVisible();
      }
    }

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

    expect(text).toMatch(/Power rankings|Preseason power/i);

    const isPreseason = /Preseason power/i.test(text);
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
    await expect(page.getByRole("heading", { level: 1, name: /Power rankings/i })).toBeVisible();
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

  test("T20: slate rows print each side's Book line in mono, numbers only", async ({
    page,
  }) => {
    await page.goto("/");
    const lines = page.getByTestId("slate-line");
    // Lines are optional data (a week with no priced games prints none), but
    // every one that renders is a signed spread in the mono face, and the two
    // sides of a row mirror each other.
    for (const line of await lines.all()) {
      await expect(line).toHaveText(/^[+-]?\d+(\.\d)?$/);
      expect(await line.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/JetBrains/i);
    }
    for (const row of await page.getByTestId("slate-card").all()) {
      const pair = (await row.getByTestId("slate-line").allInnerTexts()).map(Number);
      if (pair.length === 2) expect(pair[0] + pair[1]).toBeCloseTo(0, 5);
    }
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

  // Midseason lead module (Blake, 2026-11-24): from week 8 until the playoffs
  // the hub leads with the projected playoff field and the draft order watch,
  // directly under the headline. The pinned server tracks the live season, so
  // this asserts against the real standings when the week qualifies.
  test("T40: the playoff picture leads the hub from week 8, field and draft watch from real data", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const meta = (await page.getByTestId("slate-meta").innerText()).trim();
    const week = Number(/WEEK (\d+)/i.exec(meta)?.[1]);
    const picture = page.getByTestId("playoff-picture");
    if (!(week >= 8)) {
      await expect(picture).toHaveCount(0);
      return;
    }
    await expect(picture).toBeVisible();

    // Directly under the headline: nothing else sits between them.
    const headline = await page.getByTestId("hero-headline").boundingBox();
    const box = await picture.boundingBox();
    const gotw = await page.getByTestId("gotw-title").boundingBox();
    expect(headline && box).toBeTruthy();
    expect(box!.y).toBeGreaterThan(headline!.y);
    if (gotw) expect(box!.y).toBeLessThan(gotw.y);

    // Projected field: seeds run 1..N in order, every row links to its team.
    const fieldRows = page.getByTestId("playoff-field").locator("li");
    const fieldCount = await fieldRows.count();
    expect(fieldCount).toBeGreaterThan(0);
    for (let i = 0; i < fieldCount; i++) {
      const link = fieldRows.nth(i).locator('a[href^="/teams/"]');
      await expect(link).toHaveCount(1);
      await expect(link.locator("span").first()).toHaveText(String(i + 1));
      const h = (await link.boundingBox())!.height;
      expect(h).toBeGreaterThanOrEqual(44);
    }

    // Draft watch: the non-playoff teams hold picks 1..M, lowest Max PF
    // first (checked against Postgres), and the bracket owns the rest.
    const draftRows = page.getByTestId("draft-watch").locator("li");
    const draftCount = await draftRows.count();
    if (draftCount > 0) {
      const sql = getSql();
      const rows = (await sql`
        SELECT f.slug, fs.max_points_for::float AS mpf
        FROM franchise_seasons fs
        JOIN franchises f ON f.id = fs.franchise_id
        JOIN seasons s ON s.id = fs.season_id
        WHERE s.season_year = (SELECT max(season_year) FROM seasons)
      `) as { slug: string; mpf: number | null }[];
      const mpfBySlug = new Map(rows.map((r) => [r.slug, r.mpf]));

      // Current owner of each next-season first-rounder: the last receiver
      // across completed trades (Sleeper's draft_picks_involved), keyed by
      // the original slot's slug. Untraded picks stay with their slot.
      const moves = (await sql`
        SELECT (p->>'roster_id')::int AS slot_roster, (p->>'owner_id')::int AS owner_roster
        FROM transactions t
        CROSS JOIN LATERAL jsonb_array_elements(t.draft_picks_involved) p
        WHERE t.type = 'trade' AND t.status = 'complete'
          AND p->>'season' = ((SELECT max(season_year) FROM seasons) + 1)::text
          AND (p->>'round')::int = 1
        ORDER BY t.created_at_sleeper ASC NULLS FIRST, t.created_at ASC
      `) as { slot_roster: number; owner_roster: number }[];
      const rosterSlugs = (await sql`
        SELECT fs.roster_id::int AS roster, f.slug
        FROM franchise_seasons fs
        JOIN franchises f ON f.id = fs.franchise_id
        WHERE fs.season_id = (SELECT id FROM seasons ORDER BY season_year DESC LIMIT 1)
      `) as { roster: number; slug: string }[];
      const slugByRoster = new Map(rosterSlugs.map((r) => [r.roster, r.slug]));
      const ownerBySlotSlug = new Map<string, string>();
      for (const m of moves) {
        const slot = slugByRoster.get(m.slot_roster);
        const owner = slugByRoster.get(m.owner_roster);
        if (slot && owner) ownerBySlotSlug.set(slot, owner);
      }

      let prev = -Infinity;
      for (let i = 0; i < draftCount; i++) {
        const row = draftRows.nth(i);
        const link = row.locator('a[href^="/teams/"]');
        await expect(link.locator("span").first()).toHaveText(String(i + 1));
        const slotSlug = (await row.getAttribute("data-original-slug"))!;
        const hrefSlug = (await link.getAttribute("href"))!.replace("/teams/", "");
        const expectedOwner = ownerBySlotSlug.get(slotSlug) ?? slotSlug;
        expect(hrefSlug).toBe(expectedOwner);
        if (expectedOwner !== slotSlug) {
          await expect(row).toHaveAttribute("data-traded", "true");
          await expect(row).toContainText(/via /);
        } else {
          await expect(row).toHaveAttribute("data-traded", "false");
        }
        // Max PF belongs to the original slot: it sets the pick position.
        const mpf = mpfBySlug.get(slotSlug);
        if (mpf != null) {
          expect(mpf).toBeGreaterThanOrEqual(prev);
          prev = mpf;
        }
      }
      await expect(page.getByTestId("draft-watch-bracket")).toHaveText(
        new RegExp(`^Picks ${draftCount + 1} to \\d+ are set by the playoff bracket\\.$`)
      );
    }
  });
});
