import { NextResponse } from "next/server";
import { readSessionToken, getSessionMember } from "@/lib/auth";
import {
  getMemberPicksForWeek,
  resolveBookWeek,
  type MemberBookPick,
} from "@/lib/queries/book";

/**
 * The signed-in member's picks for the week The Book is currently trading.
 *
 * Exists for the same reason /api/session does: /book is ISR-cached HTML shared
 * by the whole league, so one member's slip can never be part of it. The board
 * island fetches its own picks from here after mount.
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

    const bookWeek = await resolveBookWeek();
    if (!bookWeek) return picksResponse([], null, syncedAt);

    const picks = await getMemberPicksForWeek(
      member.id,
      bookWeek.seasonId,
      bookWeek.week,
    );

    return picksResponse(picks, bookWeek.week, syncedAt);
  } catch {
    // A slip that fails to load is a read-only board, never a broken page.
    return picksResponse([], null, syncedAt);
  }
}

function picksResponse(
  picks: MemberBookPick[],
  week: number | null,
  syncedAt: string,
) {
  return NextResponse.json(
    { data: { picks, week }, syncedAt },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
