import {
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// Async scrypt so the derivation yields the event loop instead of blocking it.
// Claim-code hashing is on the /claim request path; a synchronous scrypt there
// is a CPU-DoS lever (one request pins a worker for the full derivation).
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

// Pure, dependency-free crypto helpers for member auth. Kept separate from
// lib/auth.ts (which pulls in next/headers and the DB) so the format and
// hashing logic can be unit-tested in isolation.

// Unambiguous alphabet for human-typed claim codes: no 0/O, 1/I/L, so a code
// read aloud or off a screen can't be mistyped into a different valid code.
const CLAIM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CLAIM_GROUPS = 3;
const CLAIM_GROUP_LEN = 4;

// scrypt output length in bytes for claim-code hashes.
const SCRYPT_KEYLEN = 64;

// Claim codes expire this long after they are generated. A code past this age
// is rejected at redemption (existing sessions are unaffected) and the commish
// console flags it so it can be rotated.
export const CLAIM_CODE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * True when a claim code generated at `codeGeneratedAt` is older than the
 * expiry window. A null timestamp (legacy code with no recorded generation
 * time) is treated as non-expiring so nobody is locked out by missing data.
 * Pure so the cutoff can be unit-tested; pass `now` in tests for determinism.
 */
export function isClaimCodeExpired(
  codeGeneratedAt: Date | null,
  now: number = Date.now(),
): boolean {
  if (!codeGeneratedAt) return false;
  return now - codeGeneratedAt.getTime() > CLAIM_CODE_MAX_AGE_MS;
}

/**
 * Normalizes a user-entered claim code for hashing/verification: uppercased,
 * with dashes and whitespace stripped, so "abcd-efgh-jkmn", "ABCDEFGHJKMN",
 * and "abcd efgh jkmn" all hash to the same value.
 */
export function normalizeClaimCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Generates a human-friendly claim code like "ABCD-EFGH-JKMN" from the
 * unambiguous alphabet. Returned in plaintext exactly once; only its hash is
 * ever stored.
 */
export function generateClaimCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < CLAIM_GROUPS; g++) {
    let group = "";
    for (let i = 0; i < CLAIM_GROUP_LEN; i++) {
      group += CLAIM_ALPHABET[randomInt(CLAIM_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/**
 * Hashes a claim code with scrypt and a per-code random salt. Returns a
 * self-describing string "scrypt$<saltHex>$<hashHex>" so verification needs no
 * separate salt column.
 */
export async function hashClaimCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (
    await scrypt(normalizeClaimCode(code), salt, SCRYPT_KEYLEN)
  ).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

/**
 * Timing-safe verification of a claim code against a stored
 * "scrypt$salt$hash" string. Returns false for any malformed stored value.
 */
export async function verifyClaimCode(
  code: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  if (!salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(normalizeClaimCode(code), salt, expected.length);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Generates a 32-byte opaque session token in hex (the raw cookie value). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hashes a session token with SHA-256. The token is already high-entropy, so
 * an unsalted digest is sufficient and lets sessions be looked up by exact
 * hash match. Only the hash is stored; the plaintext lives in the cookie.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
