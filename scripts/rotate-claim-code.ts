/**
 * Break-glass claim-code rotation. For when nobody can reach the commish
 * console: the commish is locked out, or a member's row carries a legacy
 * hash-only code that can never be read back.
 *
 * Rotates the member's code and revokes their sessions, exactly like the web
 * rotate does, then prints the new code once. Anyone locked out has no session
 * to lose, so the revocation costs nothing and keeps the two paths identical.
 *
 * Usage: POSTGRES_DRIVER=pg npx tsx scripts/rotate-claim-code.ts <memberId>
 *        POSTGRES_DRIVER=pg npx tsx scripts/rotate-claim-code.ts --commish
 *
 * POSTGRES_DRIVER=pg is required locally (the Neon serverless driver's 443 is
 * blocked here). Credentials come from .env.local, whose CRON_SECRET is
 * double-quoted; nothing here reads it, but do not "fix" that quoting blind.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { db } from "@/lib/db";
import { members } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { rotateClaimCode, revokeMemberSessions } from "@/lib/auth";

function usage(): never {
  console.error(
    "Usage: POSTGRES_DRIVER=pg npx tsx scripts/rotate-claim-code.ts <memberId>\n" +
      "       POSTGRES_DRIVER=pg npx tsx scripts/rotate-claim-code.ts --commish",
  );
  process.exit(1);
}

/** Resolves the argument to exactly one member id, or exits non-zero. */
async function resolveMemberId(arg: string): Promise<number> {
  if (arg === "--commish") {
    const rows = await db
      .select({ id: members.id, displayName: members.displayName })
      .from(members)
      .where(eq(members.role, "commish"));

    if (rows.length === 0) {
      console.error("No member has role 'commish'. Pass an explicit member id.");
      process.exit(1);
    }
    if (rows.length > 1) {
      // Guessing here could rotate the wrong person's code and sign them out.
      console.error("More than one commish; pass the id you mean:");
      for (const r of rows) console.error(`  ${r.id}  ${r.displayName}`);
      process.exit(1);
    }
    return rows[0].id;
  }

  const id = Number(arg);
  if (!Number.isInteger(id) || id <= 0) usage();

  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.id, id))
    .limit(1);
  if (!row) {
    console.error(`No member with id ${id}.`);
    process.exit(1);
  }
  return row.id;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) usage();

  const memberId = await resolveMemberId(arg);
  const [before] = await db
    .select({ displayName: members.displayName, role: members.role })
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1);

  const code = await rotateClaimCode(memberId);
  await revokeMemberSessions(memberId);

  console.log("");
  console.log(`Rotated the claim code for ${before.displayName} (id ${memberId}, ${before.role}).`);
  console.log(`Any existing sessions for that member are now revoked.`);
  console.log("");
  console.log(`  ${code}`);
  console.log("");
  console.log("This is the only time the code is printed here. It stays readable");
  console.log("in the commish console, so there is nothing to write down.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Rotation failed:", err);
    process.exit(1);
  });
