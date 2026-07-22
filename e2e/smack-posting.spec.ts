import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import {
  membersTableExists,
  memberFixtureScope,
  type MemberFixtureIds,
} from "./helpers/seed-members";

// Scope-isolated fixture: unique ids/codes/bodies so the parallel
// member-claim.spec.ts worker can never race or cross-match this file's rows.
const fx = memberFixtureScope("smack");

// ============================================================================
// Member smack posting (feature/member-identity).
//
// Drives the real stack: dev/prod server + real Postgres (POSTGRES_DRIVER=pg),
// with a prefixed test franchise/member cleaned up afterward. The members/smack
// tables ship in migration 0008; when it is not applied (membersTableExists()
// === false) every test skips at runtime, matching the repo's other conditional
// specs.
//
// The composer + member feed render inside the smack section of the preseason
// and between-weeks hubs (the seasonally-aware homepage). When the live NFL
// state resolves to a hub without that section, the render-dependent tests skip
// with a clear reason rather than assert against a section that is not on the
// page. The full flow was additionally proven against an isolated schema during
// development; this spec is the durable regression once the hub surfaces smack.
// ============================================================================

test.describe.configure({ mode: "serial" });

let tablesReady = false;
let fixture: MemberFixtureIds | null = null;

test.beforeAll(async () => {
  tablesReady = await membersTableExists();
  if (tablesReady) {
    fixture = await fx.seed();
  }
});

test.afterAll(async () => {
  if (tablesReady) {
    await fx.cleanup();
  }
});

test.beforeEach(async () => {
  test.skip(!tablesReady, "members table not present (migration 0008 unapplied)");
});

function composer(page: Page) {
  return page.locator('textarea[name="body"]');
}

async function signInAsMember(page: Page) {
  await page.goto("/claim");
  await page.fill("#code", fx.memberClaimCode);
  await page.getByRole("button", { name: /claim my team/i }).click();
  await page.waitForURL("http://localhost:3000/");
}

/** True when the current hub surfaces the smack section (composer OR ghost). */
async function smackSectionPresent(page: Page): Promise<boolean> {
  const hasComposer = (await composer(page).count()) > 0;
  const hasGhost =
    (await page.getByText(/Got something to say/i).count()) > 0;
  return hasComposer || hasGhost;
}

test.describe("Signed-out", () => {
  test("sees the claim ghost prompt, no composer", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    test.skip(
      !(await smackSectionPresent(page)),
      "current hub state does not surface the smack feed",
    );

    await expect(page.getByText(/Got something to say/i).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /claim your team/i }).first(),
    ).toBeVisible();
    await expect(composer(page)).toHaveCount(0);
  });
});

test.describe("Composer", () => {
  test("signed-in member posts and it appears team-led with a real row", async ({
    page,
  }) => {
    await signInAsMember(page);
    await page.goto("/");
    test.skip(
      (await composer(page).count()) === 0,
      "current hub state does not surface the smack composer",
    );

    // Client cap is enforced by the textarea maxlength.
    await expect(composer(page).first()).toHaveAttribute("maxlength", "280");

    const body = `e2e composer post ${Date.now()}`;
    await composer(page).first().fill(body);
    await page.getByRole("button", { name: /^post$/i }).first().click();

    // The feed re-renders with the new post, attributed to the member's
    // franchise (team-led) with the member display name in the meta line.
    await expect(page.getByText(body).first()).toBeVisible();
    await expect(page.getByText(fx.franchiseName).first()).toBeVisible();
    await expect(
      page.getByText(new RegExp(`${fx.memberDisplayName}\\s*·`)).first(),
    ).toBeVisible();

    // A real, non-hidden row persisted, attributed to the member's franchise.
    const sql = neon(process.env.POSTGRES_URL!);
    const rows = (await sql`
      SELECT "member_id", "hidden" FROM "smack_posts"
      WHERE "franchise_id" = ${fx.franchiseId} AND "body" = ${body}`) as {
      member_id: number;
      hidden: boolean;
    }[];
    expect(rows.length).toBe(1);
    expect(rows[0].member_id).toBe(fixture!.memberId);
    expect(rows[0].hidden).toBe(false);
  });

  test("the seeded hidden post never renders in the public feed", async ({
    page,
  }) => {
    await page.goto("/");
    test.skip(
      !(await smackSectionPresent(page)),
      "current hub state does not surface the smack feed",
    );
    await expect(page.getByText(fx.hiddenBody)).toHaveCount(0);
  });

  test("a 6th post within the hour shows the calm rate-limit cap", async ({
    page,
  }) => {
    await signInAsMember(page);
    await page.goto("/");
    test.skip(
      (await composer(page).count()) === 0,
      "current hub state does not surface the smack composer",
    );

    // Fill the member's hourly window to the cap (5), then attempt a 6th.
    const sql = neon(process.env.POSTGRES_URL!);
    for (let i = 0; i < 5; i++) {
      await sql`INSERT INTO "smack_posts" ("member_id", "franchise_id", "body")
        VALUES (${fixture!.memberId}, ${fx.franchiseId}, ${`e2e rate filler ${i} ${Date.now()}`})`;
    }
    await page.reload();
    await composer(page).first().fill(`over the cap ${Date.now()}`);
    await page.getByRole("button", { name: /^post$/i }).first().click();

    await expect(
      page.getByText("Easy. Five posts an hour is the cap."),
    ).toBeVisible();
  });
});
