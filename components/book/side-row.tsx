import { Check, Clock } from "lucide-react";
import { FranchiseLogo } from "@/components/franchise-logo";
import {
  formatMoney,
  formatMoneyline,
  formatSpread,
  pay,
  payoutTotal,
} from "@/lib/book/pricing";
import {
  DEFAULT_STAKE,
  gradeGamePick,
  type BookGame,
  type BookSide,
  type BookSideKey,
  type MemberBookPick,
} from "@/lib/book/shared";

/**
 * The pieces both pick surfaces of The Book are built out of: the side row
 * that carries the pick control, the line that reports the viewer's own pick
 * on a game, the status label above a card, and the shared lock-day logic.
 *
 * They started as module-local functions inside board-island.tsx and moved
 * here when the Tracking tab's slate cards began reusing all three. One
 * implementation, so a game can never read as two different objects on two
 * tabs of the same page.
 *
 * Deliberately NOT marked "use client": this module is only ever imported by
 * islands that already are, and adding a second boundary would say something
 * about the render tree that is not true.
 */

/**
 * `board` is the sportsbook row: moneyline, payout, a bare cover check.
 * `slate` is the Tracking tab's row: the cover state in words, the live score,
 * and no prices at all (the price lives one tab over, and the slate's job is
 * who took which side).
 */
export type SideRowVariant = "board" | "slate";

/** Width of the Board's spread column; the column heads above the cards share it. */
export const SPREAD_COL = "w-[76px]";
/** Width of the Board's moneyline column. */
export const ML_COL = "w-[72px]";

/**
 * `board` is the sportsbook row: the spread is the pick button, the moneyline
 * sits beside it as a price. `slate` is the Tracking tab's row: the cover
 * state in words, the live score, and no prices at all (the price lives one
 * tab over, and the slate's job is who took which side); the whole row is the
 * control there.
 *
 * Why the moneyline is not a second button on the Board: a Book pick is ONE
 * side of a game, graded against the spread (gradeGamePick), with the
 * moneyline snapshotted beside it for the friendly payout. There is no
 * separate moneyline market to book, so a moneyline button would be a second
 * control for the same pick, pretending to be a different bet.
 */
export function SideRow({
  game,
  side,
  team,
  picked,
  interactive,
  pending,
  onPick,
  variant = "board",
}: {
  game: BookGame;
  side: BookSideKey;
  team: BookSide;
  picked: boolean;
  interactive: boolean;
  pending: boolean;
  onPick: (game: BookGame, side: BookSideKey) => void;
  variant?: SideRowVariant;
}) {
  const covering = game.coveringSide === side && game.status !== "open";
  const settled = game.status === "final";
  // A push is a property of the GAME, not of one side, so it carries no side
  // tag at all; the card header says so once (see StatusKicker's `showPush`).
  const coverLabel = settled ? "Covered" : "Covering";
  const coverTag = (
    <span className="inline-flex items-center gap-1 text-caption font-semibold text-accent-green">
      <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
      {coverLabel}
    </span>
  );

  const logo = (
    <FranchiseLogo
      slug={team.slug}
      name={team.name}
      abbreviation={team.abbreviation ?? undefined}
      brandingColor={team.brandingColor ?? undefined}
      avatarUrl={team.avatarUrl ?? undefined}
      size={28}
      decorative
    />
  );

  if (variant === "board") {
    // The Board dims a game that is off the board, never one that is merely
    // unpickable-by-you: a signed-out visitor should read a live sportsbook,
    // not a greyed-out one.
    const dim = game.status !== "open" && !picked ? "opacity-55" : "";
    const spreadText = formatSpread(team.spread);
    const cell = `flex h-11 ${SPREAD_COL} shrink-0 items-center justify-center rounded-xl border font-mono text-[15px] font-bold tabular-nums`;

    let spread;
    if (interactive) {
      spread = (
        <button
          type="button"
          onClick={() => onPick(game, side)}
          disabled={pending}
          aria-pressed={picked}
          aria-label={`Pick ${team.name} ${spreadText}`}
          className={`${cell} cursor-pointer transition-[scale,background-color,border-color] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-wait ${
            picked
              ? "border-accent-gold bg-accent-gold text-canvas"
              : "border-border-control bg-transparent text-text-primary hover:bg-surface-muted"
          }`}
        >
          {spreadText}
        </button>
      );
    } else {
      // Read-only (signed out, locked, or kicked off): a price, not a control,
      // so it gets no control edge. A locked-in pick keeps a gold tint.
      spread = (
        <span
          className={`${cell} ${
            picked
              ? "border-accent-gold/45 bg-accent-gold-light text-text-primary"
              : "border-transparent bg-surface-muted text-text-primary"
          }`}
        >
          {spreadText}
        </span>
      );
    }

    return (
      <div className={`flex items-center gap-2 py-2.5 ${dim}`}>
        {logo}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 pl-1">
          {/* Wraps, never truncates: the full name is the payload. */}
          <span className="text-[15px] leading-tight font-semibold text-pretty break-words text-text-primary">
            {team.name}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-caption text-text-tertiary">
            <span className="font-mono tabular-nums">{team.record}</span>
            {covering && coverTag}
          </span>
        </span>
        {spread}
        <span
          className={`${ML_COL} shrink-0 text-center font-mono text-body-sm font-semibold tabular-nums text-text-secondary`}
        >
          {/* Names the price for screen readers; the column head is aria-hidden. */}
          <span className="sr-only">moneyline </span>
          {formatMoneyline(team.moneyline)}
        </span>
      </div>
    );
  }

  const content = (
    <>
      {logo}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-body-sm font-semibold text-pretty break-words text-text-primary">
          {team.name}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-2 text-caption text-text-tertiary">
          <span className="font-mono tabular-nums">{team.record}</span>
          {/* Under `sm` the cover tag rides the meta line instead of taking
              a share of the name's row: at 390 the franchise name is the
              payload. */}
          {covering && <span className="sm:hidden">{coverTag}</span>}
        </span>
      </span>
      {covering && <span className="hidden shrink-0 sm:inline">{coverTag}</span>}
      {game.status !== "open" && (
        <span
          className={`hidden min-w-[46px] shrink-0 text-right font-mono text-[15px] font-bold tabular-nums min-[360px]:inline sm:min-w-[52px] ${
            covering ? "text-text-primary" : "text-text-secondary"
          }`}
        >
          {team.points.toFixed(1)}
        </span>
      )}
      <span className="shrink-0 rounded-lg bg-surface-muted px-2 py-1.5 font-mono text-body-sm font-bold tabular-nums text-text-primary sm:px-2.5">
        {formatSpread(team.spread)}
      </span>
    </>
  );

  // Every phone pixel the row does not spend on gaps is a pixel the franchise
  // name keeps.
  const base =
    "flex min-h-11 w-full items-center gap-2 rounded-[11px] border p-2.5 text-left sm:gap-3";
  const skin = picked
    ? "border-accent-gold/45 bg-accent-gold-light"
    : "border-border bg-white/[.03]";

  if (!interactive) {
    return <div className={`${base} ${skin}`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onPick(game, side)}
      disabled={pending}
      aria-pressed={picked}
      aria-label={`Pick ${team.name} ${formatSpread(team.spread)}`}
      className={`${base} ${skin} cursor-pointer transition-[scale,border-color] duration-150 ease-out hover:border-border-control active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-wait`}
    >
      {content}
    </button>
  );
}

/**
 * The viewer's own pick on one game, graded.
 *
 * Note the asymmetry with every other member's pick, and keep it: the viewer's
 * own LIVE pick is graded here, because it is their own information and the
 * Board has always done it. Other members' picks stay ungraded until the game
 * is final (see buildPickemsCell), because a cover that flips three times on a
 * Sunday afternoon is noise, not a result.
 *
 * `showPayout` (the Board) adds the friendly-wager sentence for the picked
 * side only, priced off the moneyline snapshotted on the pick row. It used to
 * ride every side row on the board; once per pick is the useful version.
 *
 * Wraps rather than truncates: the team name is the payload.
 */
export function YourPickRow({
  game,
  pick,
  slipClosed,
  showPayout = false,
}: {
  game: BookGame;
  pick: MemberBookPick;
  slipClosed: boolean;
  showPayout?: boolean;
}) {
  const team = pick.side === "home" ? game.home : game.away;
  const spread = pick.side === "home" ? pick.spreadAtPick : -pick.spreadAtPick;

  let tag: string;
  let tone: string;
  if (game.status === "open") {
    const locked = slipClosed || pick.lockedAt !== null;
    tag = locked ? "Locked in" : "Locks at kickoff";
    tone = locked ? "text-accent-green" : "text-text-tertiary";
  } else {
    const result = gradeGamePick(game, pick);
    const settled = game.status === "final";
    if (result === "push") {
      tag = "Push, refunded";
      tone = "text-text-tertiary";
    } else if (result === pick.side) {
      tag = settled ? "Covered" : "Covering";
      tone = "text-accent-green";
    } else {
      tag = settled ? "Missed" : "Not covering";
      tone = "text-accent-warm";
    }
  }

  return (
    <div className="flex flex-col gap-1 border-t border-divider pt-2.5 pb-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 text-body-sm text-text-secondary">
          Your pick:{" "}
          <span className="font-semibold text-text-primary">
            {team.name}{" "}
            <span className="font-mono tabular-nums">{formatSpread(spread)}</span>
          </span>
        </span>
        <span className={`shrink-0 text-caption font-semibold ${tone}`}>
          {tag}
        </span>
      </div>
      {showPayout && (
        <p className="text-caption text-text-tertiary">
          <span className="font-mono tabular-nums">${DEFAULT_STAKE}</span>{" "}
          returns{" "}
          <span className="font-mono tabular-nums">
            {formatMoney(payoutTotal(pick.mlAtPick, DEFAULT_STAKE))}
          </span>{" "}
          (
          <span className="font-mono tabular-nums">
            {formatMoney(pay(pick.mlAtPick, DEFAULT_STAKE))}
          </span>{" "}
          profit)
        </p>
      )}
    </div>
  );
}

/**
 * A named rivalry's label for a game card header, beside StatusKicker. Renders
 * nothing for an unnamed pair. Plain text from BookGame, so it adds no client
 * state and no fetch to the islands that render it. Gold on purpose: the
 * rivalry title is one of the league's own names.
 */
export function RivalryKicker({ game }: { game: BookGame }) {
  if (!game.rivalryName) return null;
  return (
    <span
      className="min-w-0 truncate text-kicker text-accent-gold"
      data-testid="book-rivalry-name"
    >
      {game.rivalryName}
    </span>
  );
}

const WEEKDAY_NAMES: Record<string, string> = {
  SUN: "Sunday",
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
};

/** "THU" -> "Thursday"; null for a game with no known kickoff. */
export function lockDayName(label: string | null): string | null {
  if (!label) return null;
  return WEEKDAY_NAMES[label.toUpperCase()] ?? label;
}

/**
 * The lock day most of the open games share, said ONCE above the cards. A
 * card only repeats a lock day when its own differs from this one.
 * `mixed` is true when at least one open game locks on another day.
 */
export function primaryLockDay(games: BookGame[]): {
  day: string | null;
  mixed: boolean;
  anyOpen: boolean;
} {
  const counts = new Map<string | null, number>();
  for (const g of games) {
    if (g.status !== "open") continue;
    const day = lockDayName(g.kickoffLabel);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  let day: string | null = null;
  let best = 0;
  for (const [d, n] of counts) {
    if (n > best) {
      day = d;
      best = n;
    }
  }
  return { day, mixed: counts.size > 1, anyOpen: counts.size > 0 };
}

/**
 * The one quiet lock notice above a slate of game cards: neutral surface,
 * gold Clock. Built from the games' real kickoff days.
 */
export function LockAlert({
  games,
  canChange,
}: {
  games: BookGame[];
  /** Whether the viewer can still change picks (false once their slip is locked). */
  canChange: boolean;
}) {
  const { day, mixed, anyOpen } = primaryLockDay(games);
  if (!anyOpen) return null;
  const when = day ? `${day} at kickoff` : "at kickoff";
  const title = mixed ? `Most lines lock ${when}` : `Lines lock ${when}`;
  return (
    <div
      data-testid="book-lock-alert"
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3"
    >
      <Clock
        className="size-5 shrink-0 text-accent-gold"
        strokeWidth={2}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body-sm font-semibold text-text-primary">{title}</span>
        <span className="text-caption text-text-secondary">
          {mixed
            ? "Each game locks at its own first kickoff."
            : canChange
              ? "Picks can change until then."
              : "Your slip is locked in."}
        </span>
      </span>
    </div>
  );
}

/**
 * The label above a game card: when it locks (only if that differs from the
 * page's lock alert), that it is live, or that it is done. `showPush` adds the
 * push to the final label, which is where a push belongs: it is a property of
 * the game, so no single side row can carry it.
 *
 * `primaryDay` is the day the LockAlert already announced; an open game that
 * locks that same day renders nothing here.
 */
export function StatusKicker({
  game,
  showPush = false,
  primaryDay,
}: {
  game: BookGame;
  showPush?: boolean;
  primaryDay?: string | null;
}) {
  if (game.status === "live") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-[live-pulse_1.6s_ease-out_infinite] rounded-full bg-accent-green opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-accent-green" />
        </span>
        <span className="text-kicker text-accent-green">Live</span>
      </span>
    );
  }

  if (game.status === "final") {
    const pushed = showPush && game.coveringSide === "push";
    return <span className="text-kicker">{pushed ? "Final, push" : "Final"}</span>;
  }

  const day = lockDayName(game.kickoffLabel);
  if (primaryDay !== undefined && day === primaryDay) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-kicker text-text-secondary">
      <Clock className="size-3.5 text-accent-gold" strokeWidth={2} aria-hidden="true" />
      {day ? `Locks ${day}` : "Locks at kickoff"}
    </span>
  );
}
