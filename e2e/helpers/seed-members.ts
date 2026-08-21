import { getSql } from "./sql";
import { hashClaimCode } from "../../lib/auth-crypto";

// Member-identity e2e fixture. Each spec file creates its OWN scope
// (memberFixtureScope("claim"), memberFixtureScope("smack"), ...) so parallel
// Playwright workers running different spec files never share rows: every id,
// claim code, and post body derives from the scope, and cleanup only targets
// that scope's prefix. All rows carry the e2e-member prefix so nothing can
// ever touch a real member, franchise, or session.
//
// The members/member_sessions/smack_posts tables ship in migration 0008;
// membersTableExists() lets specs skip gracefully where it is not applied, and
// createMemberTables()/dropMemberTables() let a local acceptance harness stand
// them up transiently and tear them down.
const PREFIX = "e2e-member";

// Claim-code alphabet matching lib/auth-crypto generateClaimCode (no 0/O/1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Deterministic, scope-unique, format-valid claim code (XXXX-XXXX-XXXX). */
function scopedCode(scope: string, role: string): string {
  let h = 0;
  for (const ch of `${scope}:${role}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const chars: string[] = [];
  for (let i = 0; i < 12; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    chars.push(CODE_ALPHABET[h % CODE_ALPHABET.length]);
  }
  const s = chars.join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/** True if the members table exists in the connected DB (migration 0008 applied
 *  or tables created transiently). Specs skip when this is false. */
export async function membersTableExists(): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`SELECT to_regclass('public.members') AS reg`) as {
    reg: string | null;
  }[];
  return rows[0]?.reg != null;
}

/** Creates the three member-identity tables transiently for a local acceptance
 *  run. Mirrors migration 0008 exactly: the same four FK constraints, both
 *  indexes, and the franchise_seasons.avatar_url column, so the fixture exercises
 *  the same referential integrity the migrated DB enforces. Idempotent
 *  (IF NOT EXISTS; constraints live inline on the CREATE TABLE so re-running is
 *  a no-op once the tables exist). members is created before the tables that
 *  reference it. */
export async function createMemberTables(): Promise<void> {
  const sql = getSql();
  await sql`CREATE TABLE IF NOT EXISTS "members" (
    "id" serial PRIMARY KEY NOT NULL,
    "sleeper_user_id" text NOT NULL,
    "display_name" text NOT NULL,
    "franchise_id" text,
    "role" text DEFAULT 'member' NOT NULL,
    "claim_code_hash" text,
    "code_generated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "members_sleeper_user_id_unique" UNIQUE("sleeper_user_id"),
    CONSTRAINT "members_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action
  )`;
  await sql`CREATE TABLE IF NOT EXISTS "member_sessions" (
    "id" serial PRIMARY KEY NOT NULL,
    "token_hash" text NOT NULL,
    "member_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "member_sessions_token_hash_unique" UNIQUE("token_hash"),
    CONSTRAINT "member_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action
  )`;
  await sql`CREATE TABLE IF NOT EXISTS "smack_posts" (
    "id" serial PRIMARY KEY NOT NULL,
    "member_id" integer NOT NULL,
    "franchise_id" text NOT NULL,
    "body" text NOT NULL,
    "hidden" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "smack_posts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action,
    CONSTRAINT "smack_posts_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action
  )`;
  await sql`CREATE INDEX IF NOT EXISTS "idx_member_sessions_member_id" ON "member_sessions" USING btree ("member_id")`;
  await sql`CREATE INDEX IF NOT EXISTS "idx_smack_posts_hidden_created" ON "smack_posts" USING btree ("hidden","created_at")`;
  // Migration 0008 also adds this per-season crest column; mirror it so the
  // avatar join resolves against the transient tables too.
  await sql`ALTER TABLE "franchise_seasons" ADD COLUMN IF NOT EXISTS "avatar_url" text`;
}

/** Drops the three tables. ONLY call after createMemberTables in a transient
 *  local run; never in an environment where migration 0008 is applied. */
export async function dropMemberTables(): Promise<void> {
  const sql = getSql();
  await sql`DROP TABLE IF EXISTS "smack_posts"`;
  await sql`DROP TABLE IF EXISTS "member_sessions"`;
  await sql`DROP TABLE IF EXISTS "members"`;
}

export interface MemberFixtureIds {
  commishId: number;
  memberId: number;
  hiddenPostId: number;
  visiblePostId: number;
}

export interface MemberFixtureScope {
  scope: string;
  franchiseId: string;
  franchiseSlug: string;
  franchiseName: string;
  commishSleeperId: string;
  commishDisplayName: string;
  commishClaimCode: string;
  memberSleeperId: string;
  memberDisplayName: string;
  memberClaimCode: string;
  visibleBody: string;
  hiddenBody: string;
  seed(): Promise<MemberFixtureIds>;
  cleanup(): Promise<void>;
}

/**
 * Builds a fully scope-isolated fixture: a test franchise, a commish (known
 * claim code), a plain member (own known code), and two smack posts (one
 * hidden, one visible). Every value is unique to the scope so two spec files
 * running in parallel workers cannot delete or match each other's rows either
 * in the DB or in shared page surfaces (/commish moderation, the hub feed).
 */
export function memberFixtureScope(scope: string): MemberFixtureScope {
  const prefix = `${PREFIX}-${scope}`;
  const fx: MemberFixtureScope = {
    scope,
    franchiseId: `${prefix}-franchise`,
    franchiseSlug: `${prefix}-team`,
    franchiseName: `E2E ${scope} Franchise`,
    commishSleeperId: `${prefix}-commish-sleeper`,
    commishDisplayName: `E2E ${scope} Commish`,
    commishClaimCode: scopedCode(scope, "commish"),
    memberSleeperId: `${prefix}-member-sleeper`,
    memberDisplayName: `E2E ${scope} Member`,
    memberClaimCode: scopedCode(scope, "member"),
    visibleBody: `e2e ${scope} visible smack post`,
    hiddenBody: `e2e ${scope} hidden smack post`,

    async seed(): Promise<MemberFixtureIds> {
      const sql = getSql();
      await fx.cleanup();

      await sql`INSERT INTO "franchises" ("id", "slug", "name", "abbreviation")
        VALUES (${fx.franchiseId}, ${fx.franchiseSlug}, ${fx.franchiseName}, 'E2')`;

      const commishHash = await hashClaimCode(fx.commishClaimCode);
      const commishRows = (await sql`
        INSERT INTO "members"
          ("sleeper_user_id", "display_name", "franchise_id", "role", "claim_code_hash", "code_generated_at")
        VALUES
          (${fx.commishSleeperId}, ${fx.commishDisplayName}, ${fx.franchiseId}, 'commish', ${commishHash}, now())
        RETURNING "id"`) as { id: number }[];
      const commishId = commishRows[0].id;

      const memberHash = await hashClaimCode(fx.memberClaimCode);
      const memberRows = (await sql`
        INSERT INTO "members"
          ("sleeper_user_id", "display_name", "franchise_id", "role", "claim_code_hash", "code_generated_at")
        VALUES
          (${fx.memberSleeperId}, ${fx.memberDisplayName}, ${fx.franchiseId}, 'member', ${memberHash}, now())
        RETURNING "id"`) as { id: number }[];
      const memberId = memberRows[0].id;

      const visibleRows = (await sql`
        INSERT INTO "smack_posts" ("member_id", "franchise_id", "body", "hidden")
        VALUES (${commishId}, ${fx.franchiseId}, ${fx.visibleBody}, false)
        RETURNING "id"`) as { id: number }[];
      const hiddenRows = (await sql`
        INSERT INTO "smack_posts" ("member_id", "franchise_id", "body", "hidden")
        VALUES (${commishId}, ${fx.franchiseId}, ${fx.hiddenBody}, true)
        RETURNING "id"`) as { id: number }[];

      return {
        commishId,
        memberId,
        visiblePostId: visibleRows[0].id,
        hiddenPostId: hiddenRows[0].id,
      };
    },

    async cleanup(): Promise<void> {
      const sql = getSql();
      // Children first (sessions/posts reference members). Everything filters
      // on THIS scope's prefix/franchise only, so parallel scopes are safe.
      if (await membersTableExists()) {
        await sql`DELETE FROM "member_sessions" WHERE "member_id" IN
          (SELECT "id" FROM "members" WHERE "sleeper_user_id" LIKE ${prefix + "%"})`;
        await sql`DELETE FROM "smack_posts" WHERE "franchise_id" = ${fx.franchiseId}`;
        await sql`DELETE FROM "members" WHERE "sleeper_user_id" LIKE ${prefix + "%"}`;
      }
      await sql`DELETE FROM "franchises" WHERE "id" = ${fx.franchiseId}`;
    },
  };
  return fx;
}
