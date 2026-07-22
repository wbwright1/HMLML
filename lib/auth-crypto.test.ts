import { describe, it, expect } from "vitest";
import {
  normalizeClaimCode,
  generateClaimCode,
  hashClaimCode,
  verifyClaimCode,
  generateSessionToken,
  hashSessionToken,
  isClaimCodeExpired,
  CLAIM_CODE_MAX_AGE_MS,
} from "./auth-crypto";

describe("generateClaimCode", () => {
  it("returns three dash-separated groups of four unambiguous chars", () => {
    const code = generateClaimCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("never emits ambiguous characters (0/O, 1/I/L)", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateClaimCode()).not.toMatch(/[01OIL]/);
    }
  });

  it("is effectively unique across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateClaimCode());
    expect(seen.size).toBe(500);
  });
});

describe("normalizeClaimCode", () => {
  it("uppercases and strips dashes and whitespace", () => {
    expect(normalizeClaimCode("abcd-efgh-jkmn")).toBe("ABCDEFGHJKMN");
    expect(normalizeClaimCode(" abcd efgh jkmn ")).toBe("ABCDEFGHJKMN");
  });
});

describe("hashClaimCode / verifyClaimCode", () => {
  it("verifies a code against its own hash", async () => {
    const code = generateClaimCode();
    const hash = await hashClaimCode(code);
    expect(await verifyClaimCode(code, hash)).toBe(true);
  });

  it("accepts the code regardless of dash/case formatting", async () => {
    const hash = await hashClaimCode("ABCD-EFGH-JKMN");
    expect(await verifyClaimCode("abcdefghjkmn", hash)).toBe(true);
    expect(await verifyClaimCode("abcd efgh jkmn", hash)).toBe(true);
  });

  it("rejects a wrong code", async () => {
    const hash = await hashClaimCode("ABCD-EFGH-JKMN");
    expect(await verifyClaimCode("ABCD-EFGH-JKMP", hash)).toBe(false);
  });

  it("uses a fresh salt so identical codes hash differently", async () => {
    expect(await hashClaimCode("ABCD-EFGH-JKMN")).not.toBe(
      await hashClaimCode("ABCD-EFGH-JKMN"),
    );
  });

  it("returns false for a malformed stored hash", async () => {
    expect(await verifyClaimCode("ABCD-EFGH-JKMN", "")).toBe(false);
    expect(await verifyClaimCode("ABCD-EFGH-JKMN", "notscrypt$aa$bb")).toBe(
      false,
    );
    expect(await verifyClaimCode("ABCD-EFGH-JKMN", "scrypt$$")).toBe(false);
  });
});

describe("isClaimCodeExpired", () => {
  const now = Date.UTC(2026, 6, 22); // 2026-07-22

  it("treats a fresh code as valid", () => {
    expect(isClaimCodeExpired(new Date(now - 1000), now)).toBe(false);
  });

  it("treats a code just under the window as valid", () => {
    const gen = new Date(now - CLAIM_CODE_MAX_AGE_MS + 60_000);
    expect(isClaimCodeExpired(gen, now)).toBe(false);
  });

  it("treats a code just past the window as expired", () => {
    const gen = new Date(now - CLAIM_CODE_MAX_AGE_MS - 60_000);
    expect(isClaimCodeExpired(gen, now)).toBe(true);
  });

  it("treats a null generation time as non-expiring", () => {
    expect(isClaimCodeExpired(null, now)).toBe(false);
  });
});

describe("session tokens", () => {
  it("generates a 64-hex-char (32-byte) token", () => {
    expect(generateSessionToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes deterministically to a 64-hex-char SHA-256 digest", () => {
    const token = generateSessionToken();
    const h1 = hashSessionToken(token);
    const h2 = hashSessionToken(token);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes different tokens to different digests", () => {
    expect(hashSessionToken(generateSessionToken())).not.toBe(
      hashSessionToken(generateSessionToken()),
    );
  });
});
