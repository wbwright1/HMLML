"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookPicks } from "@/lib/db/schema";
import { getSessionMember } from "@/lib/auth";
import {
  getBookBoard,
  getBookLine,
  getMemberPicksForWeek,
  getRosterKickoffStates,
  resolveBookWeek,
} from "@/lib/queries/book";
import {
  BOOK_ERRORS,
  pickRejectionReason,
  type BookActionResult,
} from "@/lib/book/shared";

const pickInput = z.object({
  week: z.number().int().min(1).max(22),
  matchupId: z.number().int().min(1),
  side: z.enum(["home", "away"]),
});

const lockInput = z.object({
  week: z.number().int().min(1).max(22),
});

function fail(error: string): BookActionResult {
  return { ok: false, error };
}

/**
 * Books, switches, or clears a member's side on one game.
 *
 * Modeled on postSmack: the session is the only identity the server trusts, the
 * input is validated here rather than taken on faith from the island, and every
 * rule the UI shows is re-enforced. The season and week come from the server's
 * own view of the calendar, never from the client, so a stale tab cannot book a
 * pick into a week that has moved on.
 *
 * Picking the side you already have on clears the pick, which is what the
 * toggle in the design does.
 *
 * The line is SNAPSHOTTED onto the row at pick time, so the hourly repricing
 * that runs right after can never move a bet somebody already made.
 */
export async function togglePick(input: {
  week: number;
  matchupId: number;
  side: "home" | "away";
}): Promise<BookActionResult> {
  const parsed = pickInput.safeParse(input);
  if (!parsed.success) return fail(BOOK_ERRORS.badInput);
  const { week, matchupId, side } = parsed.data;

  const member = await getSessionMember();
  if (!member) return fail(BOOK_ERRORS.signedOut);

  const bookWeek = await resolveBookWeek();
  if (!bookWeek) return fail(BOOK_ERRORS.noSeason);

  const line = await getBookLine(bookWeek.seasonId, week, matchupId);

  const kickoffs = line
    ? await getRosterKickoffStates(
        bookWeek.seasonId,
        bookWeek.seasonYear,
        week,
      )
    : new Map<string, { started: boolean }>();

  // Locking is a SLIP-level commitment, not a per-row one. Checking only this
  // game's row let a member lock their slip and then still add a pick to a game
  // the sync priced afterwards, because a row that does not exist carries no
  // lockedAt. Any locked pick in the week closes the whole slip.
  const [lockedRow] = await db
    .select({ id: bookPicks.id })
    .from(bookPicks)
    .where(
      and(
        eq(bookPicks.memberId, member.id),
        eq(bookPicks.seasonId, bookWeek.seasonId),
        eq(bookPicks.week, week),
        isNotNull(bookPicks.lockedAt),
      ),
    )
    .limit(1);

  const [existing] = await db
    .select()
    .from(bookPicks)
    .where(
      and(
        eq(bookPicks.memberId, member.id),
        eq(bookPicks.seasonId, bookWeek.seasonId),
        eq(bookPicks.week, week),
        eq(bookPicks.matchupId, matchupId),
      ),
    )
    .limit(1);

  // One pure ladder over the facts gathered above (see pickRejectionReason),
  // so the rules are testable without a database and read in one place.
  const rejection = pickRejectionReason({
    weekMatchesBoard: bookWeek.week === week,
    lineExists: line !== null,
    gameStarted: Boolean(
      line &&
        (kickoffs.get(line.homeRosterId)?.started ||
          kickoffs.get(line.awayRosterId)?.started),
    ),
    slipHasLockedPick: Boolean(lockedRow),
    existingPickLocked: existing?.lockedAt != null,
  });
  if (rejection) return fail(rejection);
  // Narrowing for the writes below; pickRejectionReason already refused a null.
  if (!line) return fail(BOOK_ERRORS.noLine);

  if (existing && existing.side === side) {
    // isNull(lockedAt) in the WHERE, not just the check above: the read and the
    // write are separate statements, and a lockSlip landing between them must
    // not be undone by this delete. Same reason lockSlip scopes its own update.
    await db
      .delete(bookPicks)
      .where(and(eq(bookPicks.id, existing.id), isNull(bookPicks.lockedAt)));
    revalidatePath("/book");
    return { ok: true, error: null };
  }

  const spreadAtPick = line.spread;
  const mlAtPick = side === "home" ? line.mlHome : line.mlAway;

  await db
    .insert(bookPicks)
    .values({
      memberId: member.id,
      seasonId: bookWeek.seasonId,
      week,
      matchupId,
      side,
      spreadAtPick,
      mlAtPick,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        bookPicks.memberId,
        bookPicks.seasonId,
        bookPicks.week,
        bookPicks.matchupId,
      ],
      set: { side, spreadAtPick, mlAtPick, updatedAt: new Date() },
      // Never move a pick that locked between the read above and this write.
      setWhere: isNull(bookPicks.lockedAt),
    });

  // Consensus is part of the cached page, so everyone's board picks this up.
  revalidatePath("/book");
  return { ok: true, error: null };
}

/**
 * Locks the member's whole slip early.
 *
 * Locking is sugar: every pick locks by itself at kickoff regardless. What this
 * buys is the commitment, so it is only allowed once every open game has a
 * side, exactly as the button in the design says.
 */
export async function lockSlip(input: { week: number }): Promise<BookActionResult> {
  const parsed = lockInput.safeParse(input);
  if (!parsed.success) return fail(BOOK_ERRORS.badInput);
  const { week } = parsed.data;

  const member = await getSessionMember();
  if (!member) return fail(BOOK_ERRORS.signedOut);

  const bookWeek = await resolveBookWeek();
  if (!bookWeek) return fail(BOOK_ERRORS.noSeason);
  if (bookWeek.week !== week) return fail(BOOK_ERRORS.locked);

  const board = await getBookBoard(bookWeek.seasonId, bookWeek.seasonYear, week);
  const open = board.filter((g) => g.status === "open");
  const picks = await getMemberPicksForWeek(member.id, bookWeek.seasonId, week);
  const pickedMatchups = new Set(picks.map((p) => p.matchupId));

  if (open.some((g) => !pickedMatchups.has(g.matchupId))) {
    return fail(BOOK_ERRORS.incomplete);
  }

  await db
    .update(bookPicks)
    .set({ lockedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(bookPicks.memberId, member.id),
        eq(bookPicks.seasonId, bookWeek.seasonId),
        eq(bookPicks.week, week),
        isNull(bookPicks.lockedAt),
      ),
    );

  revalidatePath("/book");
  return { ok: true, error: null };
}
