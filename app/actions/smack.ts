"use server";

import { revalidatePath } from "next/cache";
import { getSessionMember } from "@/lib/auth";
import {
  createSmackPost,
  countRecentPostsByMember,
  validateSmackBody,
} from "@/lib/queries/smack";
import type { SmackActionState } from "@/lib/smack-shared";

// Rate limit: a member may post at most this many times per window.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MINUTES = 60;

/**
 * Posts a member smack message attributed to the member's CURRENT franchise.
 * Enforces auth, a franchise attachment, the hourly rate limit, and body
 * validation server-side (the client mirrors the char cap for UX only). On
 * success, revalidates "/" so the hub feed picks up the new post.
 */
export async function postSmack(
  prevState: SmackActionState,
  formData: FormData,
): Promise<SmackActionState> {
  const member = await getSessionMember();
  if (!member) {
    return { error: "Claim your team before you start talking.", ok: prevState.ok };
  }
  if (!member.franchiseId) {
    return {
      error: "You need a team attached before you can post.",
      ok: prevState.ok,
    };
  }

  const recent = await countRecentPostsByMember(
    member.id,
    RATE_LIMIT_WINDOW_MINUTES,
  );
  if (recent >= RATE_LIMIT_MAX) {
    return { error: "Easy. Five posts an hour is the cap.", ok: prevState.ok };
  }

  const raw = formData.get("body");
  const validation = validateSmackBody(typeof raw === "string" ? raw : "");
  if (!validation.ok) {
    return { error: validation.error, ok: prevState.ok };
  }

  await createSmackPost(member.id, member.franchiseId, validation.body);
  revalidatePath("/");

  return { error: null, ok: prevState.ok + 1 };
}
