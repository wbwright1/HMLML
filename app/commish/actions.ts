"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { revalidateSite } from "@/lib/revalidate";
import {
  getSessionMember,
  rotateClaimCode,
  revokeMemberSessions,
} from "@/lib/auth";
import { setPostHidden } from "@/lib/queries/smack";
import {
  createRivalry,
  deleteRivalry,
  updateRivalry,
} from "@/lib/queries/rivalries";
import {
  parseRivalryForm,
  parseRivalryId,
  type RivalryMessageKey,
} from "@/lib/rivalry-form";
import type { IssueCodeState } from "./claim-code-state";

/** Throws unless the current session belongs to a commish. Every mutating
 *  action below re-checks server-side; the page gate is not enough on its own. */
async function requireCommish() {
  const member = await getSessionMember();
  if (!member || member.role !== "commish") {
    throw new Error("Not authorized.");
  }
  return member;
}

/**
 * Issues (generates or rotates) a claim code for a member and returns the
 * plaintext as action state so the island can reveal it immediately. Codes are
 * stored in plaintext and retrievable from the console afterwards, so this is
 * no longer a one-shot reveal; the action state just saves a page round-trip.
 * Always revokes the member's existing sessions: rotating must sign the old
 * device out, and on a first-time generate there are no sessions so it's a
 * harmless no-op. useActionState signature: (prevState, formData) => newState.
 */
export async function issueClaimCodeAction(
  _prev: IssueCodeState,
  formData: FormData,
): Promise<IssueCodeState> {
  await requireCommish();

  const rawId = formData.get("memberId");
  const memberId = Number(rawId);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    return { memberId: null, code: null, error: "Invalid member." };
  }

  const code = await rotateClaimCode(memberId);
  await revokeMemberSessions(memberId);
  revalidatePath("/commish");

  return { memberId, code, error: null };
}

/**
 * Hides or unhides a smack post for moderation, then refreshes the console AND
 * the public site: the hub renders the smack feed from the ISR cache, so
 * without a site-wide revalidation a moderated post would keep showing to
 * everyone for up to the full revalidate window.
 */
export async function setPostHiddenAction(formData: FormData): Promise<void> {
  await requireCommish();

  const postId = Number(formData.get("postId"));
  const hidden = formData.get("hidden") === "true";
  if (!Number.isInteger(postId) || postId <= 0) return;

  await setPostHidden(postId, hidden);
  revalidatePath("/commish");
  revalidateSite("commish-moderation");
}

// ---------------------------------------------------------------------------
// Named rivalries
// ---------------------------------------------------------------------------
// Plain server-action forms, no client island: each action reports back by
// redirecting to /commish with a message KEY (never free text; the page only
// renders keys it knows) and an anchor on the rivalries section. redirect()
// throws by design, so it is always called outside any try/catch.

/** Sends the commish back to the rivalries section with a result message. */
function backToRivalries(key: RivalryMessageKey, ok: boolean): never {
  const param = ok ? "rivalry" : "rivalryError";
  redirect(`/commish?${param}=${key}#rivalries`);
}

/** After a successful write: refresh the console AND every public page (the
 *  rivalry name renders inside ISR-cached HTML and the league-data cache). */
function revalidateRivalries(): void {
  revalidatePath("/commish");
  revalidateSite("commish-rivalries");
}

export async function createRivalryAction(formData: FormData): Promise<void> {
  await requireCommish();

  const parsed = parseRivalryForm(formData);
  if (!parsed.ok) backToRivalries(parsed.error, false);

  const result = await createRivalry(parsed.value);
  if (!result.ok) backToRivalries(result.reason, false);

  revalidateRivalries();
  backToRivalries("created", true);
}

export async function updateRivalryAction(formData: FormData): Promise<void> {
  await requireCommish();

  const id = parseRivalryId(formData);
  if (id == null) backToRivalries("not-found", false);

  const parsed = parseRivalryForm(formData);
  if (!parsed.ok) backToRivalries(parsed.error, false);

  const result = await updateRivalry(id, parsed.value);
  if (!result.ok) backToRivalries(result.reason, false);

  revalidateRivalries();
  backToRivalries("updated", true);
}

export async function deleteRivalryAction(formData: FormData): Promise<void> {
  await requireCommish();

  const id = parseRivalryId(formData);
  if (id == null) backToRivalries("not-found", false);

  const deleted = await deleteRivalry(id);
  if (!deleted) backToRivalries("not-found", false);

  revalidateRivalries();
  backToRivalries("deleted", true);
}
