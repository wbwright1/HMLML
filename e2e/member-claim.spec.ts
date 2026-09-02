import { test, expect } from "@playwright/test";
import { getSql } from "./helpers/sql";
import type { Page } from "@playwright/test";
import { membersTableExists, memberFixtureScope } from "./helpers/seed-members";

// Scope-isolated fixture: unique ids/codes/bodies so the parallel
// smack-posting.spec.ts worker can never race or cross-match this file's rows.
const fx = memberFixtureScope("claim");

// ============================================================================
// Member claim flow + commish console (feature/member-identity).
//
// Drives the real stack: dev/prod server + real Postgres (POSTGRES_DRIVER=pg
// against the live DB, with a prefixed test franchise/members that are cleaned
// up). The members/smack tables ship in migration 0008; when it is not applied
// (membersTableExists() === false) every test skips at runtime rather than
// failing, matching the repo's other conditional specs.
// ============================================================================

// Serial: the tests share one seeded fixture and mutate it in order (the
// issue+redeem test rotates the member's code, invalidating the member's original code
// for later sign-ins), and a single worker keeps beforeAll's seed from racing
// itself across parallel workers.
test.describe.configure({ mode: "serial" });

let tablesReady = false;

test.beforeAll(async () => {
  tablesReady = await membersTableExists();
  if (tablesReady) {
    await fx.seed();
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

/** The nav crest link that only renders for a signed-in member. */
function crestLink(page: Page) {
  // Renders in both the desktop topbar and the mobile header; assert the first
  // (topbar), which is the visible one at the desktop test viewport.
  return page.locator('a[aria-label*="manage your team"]').first();
}

async function signInWith(page: Page, code: string) {
  await page.goto("/claim");
  await page.fill("#code", code);
  await page.getByRole("button", { name: /claim my team/i }).click();
}

test.describe("Claim flow", () => {
  test("a bad code shows the calm error and stays on /claim", async ({
    page,
  }) => {
    await page.goto("/claim");
    await page.fill("#code", "ZZZZ-ZZZZ-ZZZZ");
    await page.getByRole("button", { name: /claim my team/i }).click();

    await expect(page).toHaveURL(/\/claim/);
    await expect(
      page.getByText(/doesn.?t match anything/i),
    ).toBeVisible();
  });

  test("a good code signs in, redirects home, and reveals the crest", async ({
    page,
  }) => {
    await signInWith(page, fx.commishClaimCode);

    // Redirect target is exactly "/".
    await page.waitForURL("/");
    await expect(crestLink(page)).toBeVisible();

    // /claim now shows the signed-in state with the franchise + a sign-out.
    await page.goto("/claim");
    await expect(page.getByText(fx.franchiseName)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /sign out/i }),
    ).toBeVisible();
  });
});

test.describe("Commish gate", () => {
  test("a non-commish member is redirected away from /commish", async ({
    page,
  }) => {
    await signInWith(page, fx.memberClaimCode);
    await page.waitForURL("/");

    await page.goto("/commish");
    // Gate redirects members back to /claim.
    await expect(page).toHaveURL(/\/claim/);
  });

  test("a commish sees the members list and smack moderation", async ({
    page,
  }) => {
    await signInWith(page, fx.commishClaimCode);
    await page.waitForURL("/");

    await page.goto("/commish");
    await expect(page.getByRole("heading", { name: /members/i })).toBeVisible();
    // Names recur (member rows + post author labels); presence is enough.
    await expect(page.getByText(fx.commishDisplayName).first()).toBeVisible();
    await expect(page.getByText(fx.memberDisplayName).first()).toBeVisible();
    // The seeded posts (one visible, one hidden) both appear in moderation.
    await expect(page.getByText(fx.visibleBody)).toBeVisible();
    await expect(page.getByText(fx.hiddenBody)).toBeVisible();
  });
});

test.describe("Claim-code reveal + copy", () => {
  test("revealing and copying a code changes nothing on the server", async ({
    page,
    context,
  }) => {
    // Chromium prompts for clipboard access; grant it so the real
    // navigator.clipboard.writeText in the island runs rather than rejecting.
    await context.grantPermissions(["clipboard-write"]);

    const sql = getSql();
    const liveSessions = async () =>
      (
        (await sql`
      SELECT count(*)::int AS c FROM "member_sessions" s
      JOIN "members" m ON m."id" = s."member_id"
      WHERE m."sleeper_user_id" = ${fx.memberSleeperId}
        AND s."revoked_at" IS NULL`) as { c: number }[]
      )[0].c;
    const storedCode = async () =>
      (
        (await sql`
      SELECT "claim_code" AS code FROM "members"
      WHERE "sleeper_user_id" = ${fx.memberSleeperId}`) as {
          code: string | null;
        }[]
      )[0].code;

    await signInWith(page, fx.commishClaimCode);
    await page.waitForURL("/");
    await page.goto("/commish");

    const sessionsBefore = await liveSessions();
    const codeBefore = await storedCode();
    expect(codeBefore).toBe(fx.memberClaimCode);

    const memberRow = page
      .locator(".card-surface")
      .filter({ hasText: fx.memberDisplayName });

    // Masked until asked.
    await expect(memberRow.getByText("••••-••••-••••")).toBeVisible();

    await memberRow.getByRole("button", { name: /^reveal$/i }).click();
    await expect(memberRow.getByText(fx.memberClaimCode)).toBeVisible();

    await memberRow.getByRole("button", { name: /^copy$/i }).click();
    await expect(memberRow.getByText(/^copied$/i)).toBeVisible();

    // The whole point: reading a code is inert. If Copy were ever wired to the
    // rotate action, either of these would move.
    expect(await storedCode()).toBe(fx.memberClaimCode);
    expect(await liveSessions()).toBe(sessionsBefore);

    // Hide puts it back behind the mask.
    await memberRow.getByRole("button", { name: /^hide$/i }).click();
    await expect(memberRow.getByText("••••-••••-••••")).toBeVisible();

    // Same console view, so assert the legacy row here rather than paying for
    // another sign-in: /claim throttles at 10 submits a minute per IP, and this
    // file already runs close to that ceiling.
    // The commish's own row is seeded hash-only: unreadable by construction.
    const commishRow = page
      .locator(".card-surface")
      .filter({ hasText: fx.commishDisplayName })
      .first();
    await expect(commishRow.getByText("Rotate to reveal")).toBeVisible();
    await expect(
      commishRow.getByRole("button", { name: /^copy$/i }),
    ).toHaveCount(0);
    await expect(
      commishRow.getByRole("button", { name: /^reveal$/i }),
    ).toHaveCount(0);
  });
});

test.describe("Claim-code issue + redeem chain", () => {
  test("rotating a member's code reveals it, and a 60-day-old code still redeems", async ({
    page,
  }) => {
    await signInWith(page, fx.commishClaimCode);
    await page.waitForURL("/");
    await page.goto("/commish");

    // The member's management card (seeded with a code) shows a "Rotate" control.
    const memberRow = page
      .locator(".card-surface")
      .filter({ hasText: fx.memberDisplayName });
    await memberRow.getByRole("button", { name: /rotate code/i }).click();

    // A freshly rotated code reveals itself without a second click.
    const revealed = memberRow.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await expect(revealed).toBeVisible();
    const newCode = (await revealed.textContent())!.trim();
    expect(newCode).not.toBe(fx.memberClaimCode);

    // The OLD member code no longer works (rotate invalidated it).
    await page.context().clearCookies();
    await signInWith(page, fx.memberClaimCode);
    await expect(page).toHaveURL(/\/claim/);
    await expect(page.getByText(/doesn.?t match anything/i)).toBeVisible();

    // Back-date the fresh code well past the 30-day window the old expiry gate
    // enforced. Codes never expire now, so the very next redeem must still
    // succeed; before the gate came out this exact row was rejected.
    await getSql()`UPDATE "members" SET "code_generated_at" = now() - interval '60 days'
      WHERE "sleeper_user_id" = ${fx.memberSleeperId}`;

    // The NEW code signs the member in.
    await signInWith(page, newCode);
    await page.waitForURL("/");
    await expect(crestLink(page)).toBeVisible();
  });
});

test.describe("Moderation", () => {
  test("hiding a post via the console flips it out of the public feed", async ({
    page,
  }) => {
    await signInWith(page, fx.commishClaimCode);
    await page.waitForURL("/");
    await page.goto("/commish");

    const sql = getSql();
    const visibleCount = async () =>
      (
        (await sql`
      SELECT count(*)::int AS c FROM "smack_posts"
      WHERE "franchise_id" = ${fx.franchiseId}
        AND "body" = ${fx.visibleBody} AND "hidden" = false`) as {
          c: number;
        }[]
      )[0].c;

    // Scope to the exact post card (.card-surface uniquely wraps each row); a
    // broad div locator would ambiguously match ancestors holding BOTH posts.
    const postCard = page
      .locator(".card-surface")
      .filter({ hasText: fx.visibleBody });

    await postCard.getByRole("button", { name: /^hide$/i }).click();
    // Wait for the server action + revalidation to land (the card flips to
    // "Unhide") before reading the DB. expect.poll absorbs any read-replica lag.
    await expect(
      postCard.getByRole("button", { name: /^unhide$/i }),
    ).toBeVisible();
    // Hidden-excluded (public feed) query no longer returns it.
    await expect.poll(visibleCount).toBe(0);

    // Unhide restores it to the public feed.
    await postCard.getByRole("button", { name: /^unhide$/i }).click();
    await expect(
      postCard.getByRole("button", { name: /^hide$/i }),
    ).toBeVisible();
    await expect.poll(visibleCount).toBe(1);
  });
});
