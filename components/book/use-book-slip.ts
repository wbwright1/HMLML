"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSessionMember } from "@/components/use-session-member";
import { togglePick, lockSlip } from "@/app/actions/book";
import {
  notifyBookPicksChanged,
  subscribeToBookPicksChanged,
} from "@/lib/book/pick-events";
import {
  BOOK_COPY,
  picksForBoardWeek,
  type BookGame,
  type BookSideKey,
  type MemberBookPick,
} from "@/lib/book/shared";

/**
 * The member's own pick slip for one week: the single state machine behind
 * BOTH pick surfaces (the Board's game cards and the Tracking tab's pick'ems
 * strip).
 *
 * It used to be copied, near-verbatim, into both islands. That is a bad place
 * for a copy: the two surfaces write the SAME `book_picks` row through the
 * same server action, so any drift between the copies (a missing rollback, a
 * missing refresh, a different race guard) shows up as two tabs disagreeing
 * about what the member actually booked.
 *
 * Three things this owns that a naive copy tends to get wrong:
 *
 *  - **Ordering.** Every fetch and every mutation takes a sequence number. A
 *    response only lands if it is still the newest thing that happened, so a
 *    slow GET can never overwrite a pick the member has already committed.
 *  - **Failure.** A server action that rejects OR throws (offline, 500) rolls
 *    the optimistic pick back and surfaces calm copy. Anything less leaves the
 *    UI claiming a bet the book never took.
 *  - **Propagation.** A successful write refreshes the cached server tree (the
 *    consensus bars and pick counts live there) and fires the pick-events
 *    signal so the other island's copy of the slip refetches.
 *
 * Nothing here is a permission check: `togglePick`/`lockSlip` re-enforce
 * kickoff locks and slip locks server-side regardless of what this allows.
 */
export interface BookSlip {
  signedIn: boolean;
  /** Null while the session is still resolving, or when signed out. */
  franchiseSlug: string | null;
  picks: Map<number, MemberBookPick>;
  slipLocked: boolean;
  error: string | null;
  /** The matchup with an action in flight, so its controls can go inert. */
  pendingMatchup: number | null;
  canPick: boolean;
  pick: (game: BookGame, side: BookSideKey) => void;
  lock: () => void;
}

export function useBookSlip(week: number): BookSlip {
  const session = useSessionMember();
  const router = useRouter();
  const signedIn = session.status === "ready" && session.member !== null;
  const franchiseSlug =
    session.status === "ready" ? (session.member?.franchiseSlug ?? null) : null;

  const [picks, setPicks] = useState<Map<number, MemberBookPick>>(new Map());
  const [slipLocked, setSlipLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMatchup, setPendingMatchup] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // Bumped by every fetch AND every mutation. A fetch applies its payload only
  // while its own ticket is still the newest: that covers both a stale GET
  // resolving after a newer one and a GET resolving after a click it raced
  // (the click wins, because Postgres already has the row it wrote).
  const sequenceRef = useRef(0);

  const fetchPicks = useCallback(() => {
    if (!signedIn) return;
    const ticket = ++sequenceRef.current;
    fetch("/api/book/picks", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body: {
            data?: { picks: MemberBookPick[]; week: number | null };
          } | null,
        ) => {
          if (ticket !== sequenceRef.current) return;
          // Discards a payload for any week other than the one on screen; see
          // picksForBoardWeek for why that window is real.
          const mine = picksForBoardWeek(body?.data, week);
          if (!mine) return;
          setPicks(new Map(mine.map((p) => [p.matchupId, p])));
          setSlipLocked(mine.some((p) => p.lockedAt !== null));
        },
      )
      .catch(() => {
        // An unreachable slip is a read-only surface, not a broken page.
      });
  }, [signedIn, week]);

  // components/book/book-tabs.tsx keeps every pane permanently mounted, so a
  // mount-only fetch would show a pre-pick slip for the rest of the visit once
  // the member picks from the other tab. Both islands fire and subscribe to
  // the same signal (lib/book/pick-events.ts), which makes the flow two-way.
  useEffect(() => {
    fetchPicks();
    return subscribeToBookPicksChanged(fetchPicks);
  }, [fetchPicks]);

  const canPick = signedIn && !slipLocked;

  const pick = useCallback(
    (game: BookGame, side: BookSideKey) => {
      if (!canPick || game.status !== "open") return;
      setError(null);
      setPendingMatchup(game.matchupId);
      sequenceRef.current++;

      // Optimistic: the toggle should feel instant, and the server re-checks
      // every rule anyway. Both failure paths below restore the old state.
      const previous = picks.get(game.matchupId) ?? null;
      const next = new Map(picks);
      if (previous?.side === side) next.delete(game.matchupId);
      else
        next.set(game.matchupId, {
          matchupId: game.matchupId,
          side,
          spreadAtPick: game.spread,
          mlAtPick: side === "home" ? game.home.moneyline : game.away.moneyline,
          lockedAt: null,
        });
      setPicks(next);

      const rollback = () => {
        sequenceRef.current++;
        setPicks((current) => {
          const restored = new Map(current);
          if (previous) restored.set(game.matchupId, previous);
          else restored.delete(game.matchupId);
          return restored;
        });
      };

      startTransition(async () => {
        try {
          const result = await togglePick({
            week,
            matchupId: game.matchupId,
            side,
          });
          if (!result.ok) {
            setError(result.error);
            rollback();
            return;
          }
          // Consensus counts live in the cached server tree; pull the new ones.
          router.refresh();
          notifyBookPicksChanged();
        } catch {
          // Offline, a 500, an aborted navigation: the pick never landed, so
          // the UI must stop claiming it did.
          setError(BOOK_COPY.actionFailed);
          rollback();
        } finally {
          setPendingMatchup(null);
        }
      });
    },
    [canPick, picks, router, week],
  );

  const lock = useCallback(() => {
    if (!canPick) return;
    setError(null);
    sequenceRef.current++;
    startTransition(async () => {
      try {
        const result = await lockSlip({ week });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSlipLocked(true);
        setPicks((current) => {
          const stamped = new Map(current);
          const now = new Date().toISOString();
          for (const [key, value] of stamped) {
            stamped.set(key, { ...value, lockedAt: value.lockedAt ?? now });
          }
          return stamped;
        });
        router.refresh();
        // Locking closes the other tab's pick controls too, and that tab is
        // already mounted: without this it would keep offering buttons for a
        // slip the server has closed.
        notifyBookPicksChanged();
      } catch {
        setError(BOOK_COPY.actionFailed);
      }
    });
  }, [canPick, router, week]);

  return {
    signedIn,
    franchiseSlug,
    picks,
    slipLocked,
    error,
    pendingMatchup,
    canPick,
    pick,
    lock,
  };
}
