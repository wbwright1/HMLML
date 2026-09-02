"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  redeemClaimCode,
  createSessionCookie,
  clearSessionCookie,
  revokeCurrentSession,
} from "@/lib/auth";

// A normalized claim code is 12 chars; anything past this raw length is junk
// and must never reach scrypt (a length cap in front of the hash is the first
// line of defense against a CPU-DoS via oversized inputs).
const MAX_CODE_INPUT_LENGTH = 32;

// Best-effort per-IP throttle on the claim endpoint. In-memory and therefore
// per-serverless-instance, not a global limiter; it exists to blunt the
// scrypt CPU-DoS vector alongside the async hashing and the length cap. Brute
// force is already infeasible against the ~59-bit code entropy.
const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_MAX_ATTEMPTS = 10;
const attemptsByIp = new Map<string, number[]>();

function isThrottled(ip: string, now: number = Date.now()): boolean {
  const recent = (attemptsByIp.get(ip) ?? []).filter(
    (t) => now - t < THROTTLE_WINDOW_MS,
  );
  recent.push(now);
  attemptsByIp.set(ip, recent);
  return recent.length > THROTTLE_MAX_ATTEMPTS;
}

/**
 * Redeems a claim code from the /claim form. On success opens a session cookie
 * and sends the member home; otherwise it bounces back to /claim with an error
 * flag (bad code or throttled) so the page re-renders the matching calm copy.
 * The plaintext code is never echoed into the URL.
 */
export async function claimAction(formData: FormData): Promise<void> {
  // Throttle before any work so repeated hits can't each pay for a scrypt.
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isThrottled(ip)) {
    redirect("/claim?e=slow");
  }

  const raw = formData.get("code");
  const code = (typeof raw === "string" ? raw : "").trim();

  // Blank or oversized input can't be a valid code; reject before hashing.
  if (!code || code.length > MAX_CODE_INPUT_LENGTH) {
    redirect("/claim?e=1");
  }

  const result = await redeemClaimCode(code);
  if (!result.ok) {
    redirect("/claim?e=1");
  }

  await createSessionCookie(result.token);
  redirect("/");
}

/**
 * Signs the member out on this device: revokes the current server session (so
 * a leaked token can't be replayed), then clears the httpOnly session cookie.
 * (A full "sign out everywhere" is the commish's rotate-code action.)
 */
export async function signOutAction(): Promise<void> {
  await revokeCurrentSession();
  await clearSessionCookie();
  redirect("/claim");
}
