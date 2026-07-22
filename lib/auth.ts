import { cookies } from "next/headers";
import { and, eq, gt, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { members, memberSessions, franchises } from "@/lib/db/schema";
import type { Member } from "@/lib/db/schema";
import {
  generateClaimCode,
  hashClaimCode,
  verifyClaimCode,
  generateSessionToken,
  hashSessionToken,
  isClaimCodeExpired,
} from "@/lib/auth-crypto";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";

// Re-export the pure crypto helpers so callers have a single auth entrypoint.
export {
  generateClaimCode,
  hashClaimCode,
  verifyClaimCode,
  generateSessionToken,
  hashSessionToken,
  normalizeClaimCode,
  isClaimCodeExpired,
} from "@/lib/auth-crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = "hmlml_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year
const SESSION_DURATION_MS = SESSION_MAX_AGE_SECONDS * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A member plus their currently-controlled franchise's slug/name (nullable). */
export interface SessionMember extends Member {
  franchiseSlug: string | null;
  franchiseName: string | null;
  franchiseAvatarUrl: string | null;
}

/**
 * Outcome of redeeming a claim code. `not_found` and `expired` are kept
 * distinct so the /claim page can show a code holder the honest reason (a
 * fresh-code nudge vs. a check-with-the-commish nudge).
 */
export type RedeemResult =
  | { ok: true; member: Member; token: string }
  | { ok: false; reason: "not_found" | "expired" };

// ---------------------------------------------------------------------------
// Claim codes
// ---------------------------------------------------------------------------

/**
 * Redeems a claim code: finds the member whose stored hash matches, opens a
 * session (random 32-byte token, only the hash persisted, 1-year expiry), and
 * returns the member with the plaintext token. Returns null when no member
 * matches. The plaintext token is the caller's only chance to set the cookie.
 *
 * Claim-code hashes use a per-code salt, so lookup can't be a single indexed
 * query; it scans the (max ~12) members that currently carry a code. That is
 * trivially cheap at league scale.
 */
export async function redeemClaimCode(code: string): Promise<RedeemResult> {
  const candidates = await db
    .select()
    .from(members)
    .where(isNotNull(members.claimCodeHash));

  // verifyClaimCode is async (scrypt), so match with an explicit loop rather
  // than Array.find with an async predicate (which would never reject).
  let member: Member | null = null;
  for (const m of candidates) {
    if (m.claimCodeHash && (await verifyClaimCode(code, m.claimCodeHash))) {
      member = m;
      break;
    }
  }
  if (!member) return { ok: false, reason: "not_found" };

  // A matched-but-stale code is rejected distinctly so the holder is told to
  // ask for a fresh one rather than being sent to check a code that is correct.
  if (isClaimCodeExpired(member.codeGeneratedAt)) {
    return { ok: false, reason: "expired" };
  }

  const token = generateSessionToken();
  const now = new Date();
  await db.insert(memberSessions).values({
    tokenHash: hashSessionToken(token),
    memberId: member.id,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
  });

  return { ok: true, member, token };
}

/**
 * Generates a fresh claim code for a member, stores its hash (invalidating any
 * previous code), and returns the plaintext to show the commish once.
 */
export async function rotateClaimCode(memberId: number): Promise<string> {
  const code = generateClaimCode();
  const claimCodeHash = await hashClaimCode(code);
  await db
    .update(members)
    .set({
      claimCodeHash,
      codeGeneratedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(members.id, memberId));
  return code;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Marks all of a member's sessions revoked (immediate logout everywhere). */
export async function revokeMemberSessions(memberId: number): Promise<void> {
  await db
    .update(memberSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(memberSessions.memberId, memberId),
        isNull(memberSessions.revokedAt),
      ),
    );
}

/**
 * Writes the session cookie holding the plaintext token. httpOnly + secure +
 * sameSite lax, valid for one year.
 */
export async function createSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Clears the session cookie (logout). Does not revoke the DB session. */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Revokes the current cookie's server session (sets revoked_at), so the token
 * can never be presented again even if the cookie leaked before sign-out.
 * Error-tolerant: a missing or invalid token is a no-op, leaving the caller to
 * clear the cookie regardless.
 */
export async function revokeCurrentSession(): Promise<void> {
  try {
    const token = await readSessionToken();
    if (!token) return;
    await db
      .update(memberSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(memberSessions.tokenHash, hashSessionToken(token)),
          isNull(memberSessions.revokedAt),
        ),
      );
  } catch {
    // Best-effort: sign-out still clears the cookie even if revocation fails.
  }
}

/** Reads the raw session token from the request cookies, if present. */
export async function readSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * Resolves the current session to its member, or null. Validates the token
 * against a stored hash that is unexpired and unrevoked, and joins the
 * member's currently-controlled franchise slug/name for display.
 */
export async function getSessionMember(): Promise<SessionMember | null> {
  const token = await readSessionToken();
  if (!token) return null;

  const [row] = await db
    .select({
      member: members,
      franchiseSlug: franchises.slug,
      franchiseName: franchises.name,
    })
    .from(memberSessions)
    .innerJoin(members, eq(memberSessions.memberId, members.id))
    .leftJoin(franchises, eq(members.franchiseId, franchises.id))
    .where(
      and(
        eq(memberSessions.tokenHash, hashSessionToken(token)),
        isNull(memberSessions.revokedAt),
        gt(memberSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;

  // The current-season crest sits next to the member on the nav, /claim, and
  // commish surfaces. Decorative, so resolve it defensively and degrade to the
  // monogram (null) rather than failing the whole session read.
  let franchiseAvatarUrl: string | null = null;
  if (row.member.franchiseId) {
    const avatars = await getLatestAvatarUrls([row.member.franchiseId]);
    franchiseAvatarUrl = avatars.get(row.member.franchiseId) ?? null;
  }

  return {
    ...row.member,
    franchiseSlug: row.franchiseSlug ?? null,
    franchiseName: row.franchiseName ?? null,
    franchiseAvatarUrl,
  };
}
