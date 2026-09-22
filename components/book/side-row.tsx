import { FranchiseLogo } from "@/components/franchise-logo";
import { formatMoneyline, formatSpread, payoutLabel } from "@/lib/book/pricing";
import {
  DEFAULT_STAKE,
  gradeGamePick,
  type BookGame,
  type BookSide,
  type BookSideKey,
  type MemberBookPick,
} from "@/lib/book/shared";

/**
 * The three pieces both pick surfaces of The Book are built out of: the side
 * row that IS the pick control, the line that reports the viewer's own pick on
 * a game, and the status kicker above a card.
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
  const coverLabel = settled ? "Covered ✓" : "Covering ✓";

  const content =
    variant === "slate" ? (
      <>
        <FranchiseLogo
          slug={team.slug}
          name={team.name}
          abbreviation={team.abbreviation ?? undefined}
          brandingColor={team.brandingColor ?? undefined}
          avatarUrl={team.avatarUrl ?? undefined}
          size={28}
          decorative
        />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-body-sm font-semibold text-text-primary">
            {team.name}
          </span>
          <span className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-text-tertiary">
            <span className="font-mono tabular-nums">{team.record}</span>
            {/* Under `sm` the cover tag rides the meta line instead of taking
                a share of the name's row: at 390 the franchise name is the
                payload, and four items on one line truncated it to a letter. */}
            {covering && (
              <span className="text-caption font-semibold normal-case tracking-normal text-accent-green sm:hidden">
                {coverLabel}
              </span>
            )}
          </span>
        </span>
        {covering && (
          <span className="hidden shrink-0 text-caption font-semibold text-accent-green sm:inline">
            {coverLabel}
          </span>
        )}
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
    ) : (
      <>
        <FranchiseLogo
          slug={team.slug}
          name={team.name}
          abbreviation={team.abbreviation ?? undefined}
          brandingColor={team.brandingColor ?? undefined}
          avatarUrl={team.avatarUrl ?? undefined}
          size={28}
          decorative
        />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-body-sm font-semibold text-text-primary">
            {team.name}
          </span>
          <span className="block text-[11px] text-text-tertiary">
            <span className="font-mono tabular-nums">{team.record}</span>
          </span>
          <span className="block text-[11px] text-text-tertiary sm:hidden">
            <span className="font-mono tabular-nums leading-tight">
              {payoutLabel(team.moneyline, DEFAULT_STAKE)}
            </span>
          </span>
        </span>
        <span className="shrink-0 rounded-lg bg-surface-muted px-2.5 py-1 font-mono text-body-sm font-bold tabular-nums text-text-primary">
          {formatSpread(team.spread)}
        </span>
        <span className="w-11 shrink-0 text-right font-mono text-caption font-semibold normal-case tracking-normal tabular-nums text-text-tertiary">
          {formatMoneyline(team.moneyline)}
        </span>
        <span className="hidden w-[168px] shrink-0 text-right text-caption normal-case leading-tight tracking-normal text-text-tertiary sm:block">
          <span className="font-mono tabular-nums">
            {payoutLabel(team.moneyline, DEFAULT_STAKE)}
          </span>
        </span>
        {covering && (
          <span className="shrink-0 text-caption font-semibold text-accent-green">
            ✓
          </span>
        )}
      </>
    );

  // Every phone pixel the row does not spend on gaps is a pixel the franchise
  // name keeps: at 390 the name is the payload, and a 12px gutter between five
  // items was truncating it to an initial.
  const base = `flex w-full items-center rounded-[11px] border p-2.5 text-left transition-colors duration-150 ${
    variant === "slate" ? "gap-2 sm:gap-3" : "gap-3"
  }`;
  const skin = picked
    ? "border-accent-gold/45 bg-accent-gold-light"
    : "border-border bg-white/[.03]";
  // The Board dims a game that is off the board, never one that is merely
  // unpickable-by-you: a signed-out visitor should read a live sportsbook, not
  // a greyed-out one. The slate never dims at all, because a settled card
  // there is the point of the card, not a leftover.
  const dim =
    variant === "board" && game.status !== "open" && !picked ? "opacity-55" : "";

  if (!interactive) {
    return <div className={`${base} ${skin} ${dim}`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onPick(game, side)}
      disabled={pending}
      aria-pressed={picked}
      aria-label={`Pick ${team.name} ${formatSpread(team.spread)}`}
      className={`${base} ${skin} cursor-pointer hover:border-border-strong disabled:cursor-wait`}
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
 * Wraps rather than truncates: the team name is the payload, so at 390 the tag
 * drops to a second line instead of the name ellipsing away.
 */
export function YourPickRow({
  game,
  pick,
  slipClosed,
}: {
  game: BookGame;
  pick: MemberBookPick;
  slipClosed: boolean;
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
      tag = "Push · refunded";
      tone = "text-text-tertiary";
    } else if (result === pick.side) {
      tag = settled ? "Covered ✓" : "Covering ✓";
      tone = "text-accent-green";
    } else {
      tag = settled ? "Missed ✗" : "Not covering ✗";
      tone = "text-accent-warm";
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-[10px] bg-white/[.03] px-3 py-2">
      <span className="min-w-0 text-caption normal-case tracking-normal text-text-secondary">
        Your pick ·{" "}
        <span className="font-mono font-bold tabular-nums text-text-primary">
          {team.name} {formatSpread(spread)}
        </span>
      </span>
      <span className={`shrink-0 text-caption font-semibold ${tone}`}>
        {tag}
      </span>
    </div>
  );
}

/**
 * A named rivalry's label for a game card header, beside StatusKicker. Renders
 * nothing for an unnamed pair. Plain text from BookGame, so it adds no client
 * state and no fetch to the islands that render it.
 */
export function RivalryKicker({ game }: { game: BookGame }) {
  if (!game.rivalryName) return null;
  return (
    <span
      className="min-w-0 truncate text-kicker text-text-secondary"
      data-testid="book-rivalry-name"
    >
      <span aria-hidden="true">· </span>
      {game.rivalryName}
    </span>
  );
}

/**
 * The kicker above a game card: when it locks, that it is live, or that it is
 * done. `showPush` adds the push to the FINAL label, which is where a push
 * belongs: it is a property of the game, so no single side row can carry it.
 * The Board leaves it off, since its side rows already read the same either
 * way and its slip says "Push" on the member's own row.
 */
export function StatusKicker({
  game,
  showPush = false,
}: {
  game: BookGame;
  showPush?: boolean;
}) {
  if (game.status === "live") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="relative flex size-2" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-[live-pulse_1.6s_ease-out_infinite] rounded-full bg-accent-green opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-accent-green" />
        </span>
        <span className="text-kicker text-accent-green">Locked · Live</span>
      </span>
    );
  }

  if (game.status === "final") {
    const pushed = showPush && game.coveringSide === "push";
    return <span className="text-kicker">{pushed ? "Final · Push" : "Final"}</span>;
  }

  return (
    <span className="text-kicker text-accent-gold">
      {game.kickoffLabel ? `Locks ${game.kickoffLabel}` : "Locks at kickoff"}
    </span>
  );
}
