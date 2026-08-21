"use server";

import { revalidatePath } from "next/cache";
import { revalidateSite } from "@/lib/revalidate";
import {
  getSessionMember,
  rotateClaimCode,
  revokeMemberSessions,
} from "@/lib/auth";
import { setPostHidden } from "@/lib/queries/smack";
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
 * plaintext ONCE as action state so the client island can reveal it in-page.
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
