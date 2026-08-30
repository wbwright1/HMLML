"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FranchiseLogo } from "@/components/franchise-logo";
import { PlayerHeadshot } from "@/components/player-headshot";
import { useSessionMember } from "@/components/use-session-member";
import { pickFuture } from "@/app/actions/book";
import { formatMoneyline, payoutLabel } from "@/lib/book/pricing";
import {
  DEFAULT_STAKE,
  FUTURES_COPY,
  MIN_PICKS_FOR_CONSENSUS,
  futurePicksForSeason,
  futuresLockNote,
  futuresRulesFor,
  type CopySegment,
  type FuturesBoard,
  type FuturesEntry,
  type FuturesMarket,
  type MemberFuturePick,
} from "@/lib/book/shared";

/**
 * Futures: the season-long half of The Book.
 *
 * A client island (enumerated in CLAUDE.md) for exactly the reason the weekly
 * board is one: /book is ISR-cached HTML served to the whole league, so the
 * member's own futures cannot be in the server tree. The session resolves
 * through the shared /api/session hook and the picks come from
 * /api/book/future-picks after mount. Every rule this island shows is
 * re-enforced by the server action; nothing here is a permission check.
 *
 * Signed out, the boards read completely: prices, attribution, consensus and
 * results all render, there is just nothing to press.
 */
export function FuturesIsland({
  boards,
  seasonId,
  finalRegularWeek,
}: {
  boards: FuturesBoard[];
  seasonId: number | null;
  finalRegularWeek: number;
}) {
  const session = useSessionMember();
  const router = useRouter();
  const [picks, setPicks] = useState<Map<FuturesMarket, MemberFuturePick>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingMarket, setPendingMarket] = useState<FuturesMarket | null>(null);
  const [, startTransition] = useTransition();

  const signedIn = session.status === "ready" && session.member !== null;

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    fetch("/api/book/future-picks", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body: {
            data?: { picks: MemberFuturePick[]; seasonId: number | null };
          } | null,
        ) => {
          if (!active) return;
          // Discards a payload for any season other than the one these boards
          // are showing; see futurePicksForSeason for why that window is real.
          const mine = futurePicksForSeason(body?.data, seasonId);
          if (!mine) return;
          setPicks(new Map(mine.map((p) => [p.market, p])));
        },
      )
      .catch(() => {
        // An unreachable slip is a read-only board, not a broken page.
      });
    return () => {
      active = false;
    };
  }, [signedIn, seasonId]);

  function onPick(board: FuturesBoard, entry: FuturesEntry) {
    if (!signedIn || board.locked) return;
    setError(null);
    setPendingMarket(board.market);

    // Optimistic: the server re-checks every rule, and a rejection restores the
    // previous state below. The odds here come from the ISR-cached page, which
    // is why the booked price is taken from the action's answer once it lands.
    const previous = picks.get(board.market) ?? null;
    const next = new Map(picks);
    if (previous?.subjectId === entry.subjectId) next.delete(board.market);
    else
      next.set(board.market, {
        market: board.market,
        subjectId: entry.subjectId,
        oddsAtPick: entry.odds,
      });
    setPicks(next);

    startTransition(async () => {
      const result = await pickFuture({
        market: board.market,
        subjectId: entry.subjectId,
      });
      setPendingMarket(null);
      if (!result.ok) {
        setError(result.error);
        setPicks((current) => {
          const restored = new Map(current);
          if (previous) restored.set(board.market, previous);
          else restored.delete(board.market);
          return restored;
        });
        return;
      }
      // The page HTML is ISR-cached, so entry.odds can be staler than the row
      // the pick actually booked against, and nothing else would ever correct
      // it: router.refresh re-renders the server tree but does not re-run the
      // picks fetch. The action returns the odds it stored, so the slip quotes
      // the price the database holds rather than the one the cache showed.
      if (result.oddsAtPick != null) {
        const booked = result.oddsAtPick;
        setPicks((current) => {
          const settled = new Map(current);
          settled.set(board.market, {
            market: board.market,
            subjectId: entry.subjectId,
            oddsAtPick: booked,
          });
          return settled;
        });
      }
      // Consensus lives in the cached page; pull the refreshed numbers.
      router.refresh();
    });
  }

  if (boards.length === 0) {
    return (
      <div className="card-surface p-6">
        <p className="text-body text-text-secondary">
          {FUTURES_COPY.emptyBoard}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        {error && (
          <p
            role="status"
            className="card-surface p-3 text-body-sm text-accent-warm"
          >
            {error}
          </p>
        )}
        {boards.map((board) => (
          <MarketCard
            key={board.market}
            board={board}
            pick={picks.get(board.market) ?? null}
            canPick={signedIn && !board.locked}
            pending={pendingMarket === board.market}
            finalRegularWeek={finalRegularWeek}
            onPick={onPick}
          />
        ))}
      </div>

      <aside>
        <FuturesSlip boards={boards} picks={picks} signedIn={signedIn} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One market
// ---------------------------------------------------------------------------

function MarketCard({
  board,
  pick,
  canPick,
  pending,
  finalRegularWeek,
  onPick,
}: {
  board: FuturesBoard;
  pick: MemberFuturePick | null;
  canPick: boolean;
  pending: boolean;
  finalRegularWeek: number;
  onPick: (board: FuturesBoard, entry: FuturesEntry) => void;
}) {
  const copy = FUTURES_COPY.markets[board.market];

  return (
    <div className="card-surface p-5">
      <div className="mb-3.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <p className="text-kicker mb-1">{copy.label}</p>
          <h2 className="text-h3 text-text-primary">{copy.title}</h2>
        </div>
        <span
          className={`text-caption font-semibold ${
            board.locked ? "text-text-tertiary" : "text-accent-gold"
          }`}
        >
          {board.locked ? (
            FUTURES_COPY.lockedNote
          ) : (
            <Copy segments={futuresLockNote(board.lockWeek)} />
          )}
        </span>
      </div>

      {copy.snark && (
        <p className="mb-3.5 font-serif text-body-sm italic text-text-tertiary">
          {copy.snark}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {board.entries.map((entry) => (
          <EntryRow
            key={entry.subjectId}
            entry={entry}
            picked={pick?.subjectId === entry.subjectId}
            interactive={canPick}
            pending={pending}
            onPick={() => onPick(board, entry)}
          />
        ))}
      </div>

      <p className="mt-4 rounded-[10px] border border-dashed border-border-strong px-3 py-2 text-[11px] leading-relaxed text-text-tertiary">
        <Copy segments={futuresRulesFor(board.market, finalRegularWeek)} />
      </p>
    </div>
  );
}

/**
 * Copy with its numerals in the mono face, which every numeral on this site
 * wears. The segments arrive pre-split from lib/book/shared.ts, so this stays a
 * renderer rather than a parser.
 */
function Copy({ segments }: { segments: CopySegment[] }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.mono ? (
          <span key={i} className="font-mono tabular-nums">
            {segment.text}
          </span>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function EntryRow({
  entry,
  picked,
  interactive,
  pending,
  onPick,
}: {
  entry: FuturesEntry;
  picked: boolean;
  interactive: boolean;
  pending: boolean;
  onPick: () => void;
}) {
  const content = (
    <>
      <EntryMark entry={entry} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-body-sm font-semibold text-text-primary">
          {entry.name}
        </span>
        <span className="block truncate text-[11px] text-text-tertiary">
          {entry.position && (
            <>
              {entry.position}
              {entry.nflTeam ? ` · ${entry.nflTeam}` : ""}
              {" · "}
            </>
          )}
          {entry.context.map((part, i) => (
            <span key={`${part.label}-${i}`}>
              {i > 0 && " · "}
              {part.stat && (
                <span className="font-mono tabular-nums">{part.stat} </span>
              )}
              {part.label}
            </span>
          ))}
        </span>
      </span>

      {entry.pickCount >= MIN_PICKS_FOR_CONSENSUS && (
        <span className="hidden shrink-0 text-[11px] text-text-tertiary sm:block">
          <span className="font-mono tabular-nums">{entry.pickCount}</span> in
        </span>
      )}

      <span className="shrink-0 rounded-lg bg-surface-muted px-2.5 py-1 font-mono text-body-sm font-bold tabular-nums text-text-primary">
        {formatMoneyline(entry.odds)}
      </span>
      <span className="hidden w-[168px] shrink-0 text-right text-caption normal-case leading-tight tracking-normal text-text-tertiary sm:block">
        <span className="font-mono tabular-nums">
          {payoutLabel(entry.odds, DEFAULT_STAKE)}
        </span>
      </span>

      {entry.gradedResult === "win" && (
        <span className="shrink-0 text-caption font-semibold text-accent-green">
          Won ✓
        </span>
      )}
      {entry.gradedResult === "loss" && (
        <span className="shrink-0 text-caption font-semibold text-accent-warm">
          Lost ✗
        </span>
      )}
    </>
  );

  const base =
    "flex w-full items-center gap-3 rounded-[11px] border p-2.5 text-left transition-colors duration-150";
  const skin = picked
    ? "border-accent-gold/45 bg-accent-gold-light"
    : "border-border bg-white/[.03]";
  // A graded loser dims; a market nobody can bet does not. A signed-out visitor
  // should read a live board, not a greyed-out one.
  const dim = entry.gradedResult === "loss" ? "opacity-55" : "";

  if (!interactive) {
    return <div className={`${base} ${skin} ${dim}`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={pending}
      aria-pressed={picked}
      aria-label={`Pick ${entry.name} ${formatMoneyline(entry.odds)}`}
      className={`${base} ${skin} cursor-pointer hover:border-border-strong disabled:cursor-wait`}
    >
      {content}
    </button>
  );
}

/** The crest, the headshot, or the plain mark The Field gets. */
function EntryMark({ entry }: { entry: FuturesEntry }) {
  if (entry.subjectType === "franchise") {
    return (
      <FranchiseLogo
        // Never null on a franchise row (the slug column is NOT NULL); the type
        // carries null only because players and The Field share this shape.
        slug={entry.slug ?? ""}
        name={entry.name}
        abbreviation={entry.abbreviation ?? undefined}
        brandingColor={entry.brandingColor ?? undefined}
        avatarUrl={entry.imageUrl ?? undefined}
        size={28}
        decorative
      />
    );
  }

  if (entry.subjectType === "player") {
    return (
      <PlayerHeadshot
        playerId={entry.subjectId}
        name={entry.name}
        size={28}
        showTeamBadge={false}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted font-mono text-[11px] font-bold text-text-tertiary"
    >
      ALL
    </span>
  );
}

// ---------------------------------------------------------------------------
// The slip
// ---------------------------------------------------------------------------

function FuturesSlip({
  boards,
  picks,
  signedIn,
}: {
  boards: FuturesBoard[];
  picks: Map<FuturesMarket, MemberFuturePick>;
  signedIn: boolean;
}) {
  return (
    <div className="card-surface p-5">
      <p className="text-kicker mb-3.5">Your Futures</p>

      {!signedIn ? (
        <p className="text-body-sm text-text-secondary">
          {FUTURES_COPY.signedOut}{" "}
          <Link href="/claim" className="font-semibold text-accent-gold">
            Claim your team.
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col">
          {boards.map((board) => (
            <SlipRow
              key={board.market}
              board={board}
              pick={picks.get(board.market) ?? null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SlipRow({
  board,
  pick,
}: {
  board: FuturesBoard;
  pick: MemberFuturePick | null;
}) {
  const label = FUTURES_COPY.markets[board.market].label;

  if (!pick) {
    return (
      <li className="flex items-center justify-between gap-3 border-t border-divider py-2.5">
        <span className="min-w-0 truncate text-body-sm text-text-tertiary">
          {label}
        </span>
        <span
          className={`shrink-0 text-caption font-semibold ${
            board.locked ? "text-text-tertiary" : "text-accent-gold"
          }`}
        >
          {board.locked ? "Missed it" : "Open"}
        </span>
      </li>
    );
  }

  const entry = board.entries.find((e) => e.subjectId === pick.subjectId);
  const name = entry?.name ?? "Off the board";

  let tag: string;
  let tone: string;
  if (entry?.gradedResult === "win") {
    tag = "Won ✓";
    tone = "text-accent-green";
  } else if (entry?.gradedResult === "loss") {
    tag = "Lost ✗";
    tone = "text-accent-warm";
  } else if (board.locked) {
    tag = "Locked";
    tone = "text-accent-green";
  } else {
    tag = "Open";
    tone = "text-text-tertiary";
  }

  return (
    <li className="flex items-center justify-between gap-3 border-t border-divider py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-body-sm font-semibold text-text-primary">
          {name}{" "}
          <span className="font-mono tabular-nums text-text-secondary">
            {formatMoneyline(pick.oddsAtPick)}
          </span>
        </span>
        <span className="block text-[11px] leading-tight text-text-tertiary">
          {label} ·{" "}
          <span className="font-mono tabular-nums">
            {payoutLabel(pick.oddsAtPick, DEFAULT_STAKE)}
          </span>
        </span>
      </span>
      <span className={`shrink-0 text-caption font-semibold ${tone}`}>
        {tag}
      </span>
    </li>
  );
}
