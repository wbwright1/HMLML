"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookFuturePicks, bookPicks, bookPropPicks } from "@/lib/db/schema";
import { getSessionMember } from "@/lib/auth";
import {
  getBookBoard,
  getBookLine,
  getMemberPicksForWeek,
  getRosterKickoffStates,
  resolveBookWeek,
} from "@/lib/queries/book";
import { getBookPropById, isWeekLocked } from "@/lib/queries/book-props";
import {
  getFutureRow,
  isFuturesMarketLocked,
  resolveFuturesSeason,
} from "@/lib/queries/book-futures";
import {
  BOOK_ERRORS,
  futurePickRejectionReason,
  pickRejectionReason,
  propPickRejectionReason,
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

const futurePickInput = z.object({
  market: z.enum(["champion", "toilet_bowl", "mvp", "roty"]),
  subjectId: z.string().min(1).max(64),
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
 * Books, switches, or clears a member's call on one futures market.
 *
 * Same discipline as togglePick: the session is the only identity trusted, the
 * season comes from the server's own view of the calendar rather than from the
 * client, and every rule the board shows is re-enforced here. The odds are
 * SNAPSHOTTED onto the row, so the daily repricing that runs for months
 * afterwards never moves a number somebody already took.
 *
 * One pick per market is the unique index's job, not a read-then-write check;
 * a repick lands on the conflict clause and replaces the row in place. Picking
 * the subject you already hold clears the pick, which is the same toggle the
 * weekly board uses.
 */
export async function pickFuture(input: {
  market: "champion" | "toilet_bowl" | "mvp" | "roty";
  subjectId: string;
}): Promise<BookActionResult> {
  const parsed = futurePickInput.safeParse(input);
  if (!parsed.success) return fail(BOOK_ERRORS.badInput);
  const { market, subjectId } = parsed.data;

  const member = await getSessionMember();
  if (!member) return fail(BOOK_ERRORS.signedOut);

  const season = await resolveFuturesSeason();
  if (!season) return fail(BOOK_ERRORS.noSeason);

  const row = await getFutureRow(season.seasonId, market, subjectId);
  const rejection = futurePickRejectionReason({
    subjectExists: row !== null,
    marketLocked: await isFuturesMarketLocked(season, market),
  });
  if (rejection) return fail(rejection);
  // Narrowing for the write below; futurePickRejectionReason already refused a
  // subject with no priced row.
  if (!row) return fail(BOOK_ERRORS.noFuture);

  const [existing] = await db
    .select({ id: bookFuturePicks.id, subjectId: bookFuturePicks.subjectId })
    .from(bookFuturePicks)
    .where(
      and(
        eq(bookFuturePicks.memberId, member.id),
        eq(bookFuturePicks.seasonId, season.seasonId),
        eq(bookFuturePicks.market, market),
      ),
    )
    .limit(1);

  if (existing && existing.subjectId === subjectId) {
    await db.delete(bookFuturePicks).where(eq(bookFuturePicks.id, existing.id));
    revalidatePath("/book");
    return { ok: true, error: null };
  }

  await db
    .insert(bookFuturePicks)
    .values({
      memberId: member.id,
      seasonId: season.seasonId,
      market,
      subjectId,
      oddsAtPick: row.odds,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        bookFuturePicks.memberId,
        bookFuturePicks.seasonId,
        bookFuturePicks.market,
      ],
      set: { subjectId, oddsAtPick: row.odds, updatedAt: new Date() },
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

const propPickInput = z.object({
  week: z.number().int().min(1).max(22),
  propId: z.number().int().min(1),
  side: z.enum(["over", "under"]),
});

/**
 * Books, switches, or clears a member's side on one prop.
 *
 * Modeled on togglePick, simplified: props have no slip-level lock concept
 * (see propPickRejectionReason). The whole board locks as ONE unit once the
 * week's first kickoff passes, checked live against nfl_games via
 * isWeekLocked, never a stored timestamp on book_props itself (props keep the
 * same id across hourly repricing, same reasoning as book_lines).
 */
export async function togglePropPick(input: {
  week: number;
  propId: number;
  side: "over" | "under";
}): Promise<BookActionResult> {
  const parsed = propPickInput.safeParse(input);
  if (!parsed.success) return fail(BOOK_ERRORS.badInput);
  const { week, propId, side } = parsed.data;

  const member = await getSessionMember();
  if (!member) return fail(BOOK_ERRORS.signedOut);

  const bookWeek = await resolveBookWeek();
  if (!bookWeek) return fail(BOOK_ERRORS.noSeason);

  const prop = await getBookPropById(propId);
  const propExists = Boolean(
    prop && prop.seasonId === bookWeek.seasonId && prop.week === week,
  );

  const weekLocked = propExists
    ? await isWeekLocked(bookWeek.seasonYear, week)
    : false;

  const [existing] = await db
    .select()
    .from(bookPropPicks)
    .where(and(eq(bookPropPicks.memberId, member.id), eq(bookPropPicks.propId, propId)))
    .limit(1);

  const rejection = propPickRejectionReason({
    weekMatchesBoard: bookWeek.week === week,
    propExists,
    weekLocked,
    existingPickLocked: existing?.lockedAt != null,
  });
  if (rejection) return fail(rejection);
  // Narrowing for the writes below; propPickRejectionReason already refused a
  // missing prop.
  if (!prop) return fail(BOOK_ERRORS.noProp);

  if (existing && existing.side === side) {
    await db
      .delete(bookPropPicks)
      .where(and(eq(bookPropPicks.id, existing.id), isNull(bookPropPicks.lockedAt)));
    revalidatePath("/book");
    return { ok: true, error: null };
  }

  const oddsAtPick = side === "over" ? prop.overOdds : prop.underOdds;

  await db
    .insert(bookPropPicks)
    .values({
      memberId: member.id,
      propId,
      side,
      oddsAtPick,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [bookPropPicks.memberId, bookPropPicks.propId],
      set: { side, oddsAtPick, updatedAt: new Date() },
      // Never move a pick that locked between the read above and this write.
      setWhere: isNull(bookPropPicks.lockedAt),
    });

  revalidatePath("/book");
  return { ok: true, error: null };
}
