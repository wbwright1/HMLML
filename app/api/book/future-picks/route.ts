import { NextResponse } from "next/server";
import { readSessionToken, getSessionMember } from "@/lib/auth";
import {
  getMemberFuturePicks,
  resolveFuturesSeason,
  type MemberFuturePick,
} from "@/lib/queries/book-futures";

/**
 * The signed-in member's futures picks for the season The Book is trading.
 *
 * The season-scoped twin of /api/book/picks, and it exists for the same reason:
 * /book is ISR-cached HTML shared by the whole league, so one member's futures
 * can never be part of it. The futures island fetches its own after mount.
 *
 * The season id ships with the picks so the island can refuse a payload for a
 * season other than the one it rendered (futurePicksForSeason).
 *
 * Signed out returns an empty slip WITHOUT touching Postgres, which is the
 * common (and crawler) path.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const syncedAt = new Date().toISOString();

  try {
    const token = await readSessionToken();
    if (!token) return picksResponse([], null, syncedAt);

    const member = await getSessionMember();
    if (!member) return picksResponse([], null, syncedAt);

    const season = await resolveFuturesSeason();
    if (!season) return picksResponse([], null, syncedAt);

    const picks = await getMemberFuturePicks(member.id, season.seasonId);
    return picksResponse(picks, season.seasonId, syncedAt);
  } catch {
    // An unreachable slip is a read-only board, never a broken page.
    return picksResponse([], null, syncedAt);
  }
}

function picksResponse(
  picks: MemberFuturePick[],
  seasonId: number | null,
  syncedAt: string,
) {
  return NextResponse.json(
    { data: { picks, seasonId }, syncedAt },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
