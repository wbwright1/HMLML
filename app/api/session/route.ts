import { NextResponse } from "next/server";
import { getSessionMember, readSessionToken } from "@/lib/auth";
import type { NavCrestMember } from "@/components/nav/nav-crest";

/**
 * Resolves the current session to the minimal nav-crest shape.
 *
 * This route exists so the root layout's nav can stay statically renderable.
 * Reading cookies() anywhere in the server render tree opts the WHOLE route out
 * of static generation, and the nav lives in the root layout, so doing it there
 * forced every page on the site to render per request. The crest is fetched
 * client-side from here instead (components/nav/nav-crest-island.tsx).
 *
 * Signed out (no cookie) is the crawler path and by far the common case: it
 * returns null WITHOUT opening a Postgres connection.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const syncedAt = new Date().toISOString();

  try {
    // Cheap short-circuit: no cookie means no session, and no DB query.
    const token = await readSessionToken();
    if (!token) {
      return sessionResponse(null, syncedAt);
    }

    const member = await getSessionMember();
    if (!member) {
      return sessionResponse(null, syncedAt);
    }

    return sessionResponse(
      {
        franchiseSlug: member.franchiseSlug,
        franchiseName: member.franchiseName,
        franchiseAvatarUrl: member.franchiseAvatarUrl,
        displayName: member.displayName,
      },
      syncedAt,
    );
  } catch {
    // Degrade to signed-out so the nav always renders (e.g. the members table
    // not existing yet before migration 0008).
    return sessionResponse(null, syncedAt);
  }
}

function sessionResponse(data: NavCrestMember | null, syncedAt: string) {
  return NextResponse.json(
    { data, syncedAt },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
