"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";
import { useBookSlip } from "@/components/book/use-book-slip";
import { PickToast } from "@/components/book/pick-toast";
import { MonoNumerals } from "@/components/book/mono-numerals";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  LockAlert,
  ML_COL,
  SPREAD_COL,
  SideRow,
  StatusKicker,
  RivalryKicker,
  YourPickRow,
  lockDayName,
  primaryLockDay,
} from "@/components/book/side-row";
import {
  formatMoney,
  formatMoneyline,
  formatSpread,
  pay,
} from "@/lib/book/pricing";
import {
  BOOK_COPY,
  DEFAULT_STAKE,
  gradeGamePick,
  MAX_STAKE,
  MIN_PICKS_FOR_CONSENSUS,
  MIN_STAKE,
  type BookGame,
  type BookSideKey,
  type MemberBookPick,
} from "@/lib/book/shared";

/**
 * The Board: the pick surface of The Book.
 *
 * A client island (enumerated in CLAUDE.md) for the same reason the smack
 * composer slot is one: /book is ISR-cached HTML served to the whole league, so
 * anything that differs per member cannot be in the server tree. The session
 * resolves through the shared /api/session hook and the member's own slip comes
 * from /api/book/picks after mount. Everything the island lets you do is
 * re-enforced by the server action; nothing here is a permission check.
 *
 * Signed out, the board is fully readable and completely inert: prices, records
 * and consensus all render, there is just nothing to press.
 */
export function BoardIsland({
  games,
  week,
}: {
  games: BookGame[];
  week: number;
}) {
  // One shared slip state machine for both pick surfaces (see
  // components/book/use-book-slip.ts): optimistic writes, ordered responses,
  // rollback on failure, and the two-way refresh with the Tracking tab.
  const {
    signedIn,
    picks,
    slipLocked,
    standingLock,
    error,
    pendingMatchup,
    canPick,
    canUnlock,
    saved,
    undo,
    dismissSaved,
    pick: onPick,
    lock,
    unlock,
  } = useBookSlip(week, games);

  // The lock day is said once, in the alert; cards repeat a day only when
  // theirs differs.
  const primaryDay = primaryLockDay(games).day;

  const openGames = games.filter((g) => g.status === "open");
  const openWithoutPick = openGames.filter((g) => !picks.has(g.matchupId));

  function onLock() {
    if (openWithoutPick.length > 0) return;
    lock();
  }

  if (games.length === 0) {
    return (
      <div className="card-surface p-6">
        <p className="text-body text-text-secondary">{BOOK_COPY.emptyBoard}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <LockAlert games={games} canChange={!standingLock} />
        {error && (
          <p
            role="status"
            className="card-surface p-3 text-body-sm text-accent-warm"
          >
            {error}
          </p>
        )}
        {/* Column heads once, above every card, instead of on each row.
            Decorative for screen readers: each button and price names itself. */}
        <div
          className="-mb-2 flex justify-end gap-2 pr-3"
          aria-hidden="true"
        >
          <span className={`${SPREAD_COL} text-center text-kicker`}>Spread</span>
          <span className={`${ML_COL} text-center text-kicker`}>Moneyline</span>
        </div>
        {games.map((game) => (
          <GameCard
            key={game.matchupId}
            game={game}
            pick={picks.get(game.matchupId) ?? null}
            canPick={canPick}
            pending={pendingMatchup === game.matchupId}
            slipClosed={standingLock}
            primaryDay={primaryDay}
            onPick={onPick}
          />
        ))}
      </div>
      <PickToast saved={saved} onUndo={undo} onDismiss={dismissSaved} />

      <aside className="flex flex-col gap-6">
        <PickSlip
          games={games}
          picks={picks}
          week={week}
          signedIn={signedIn}
          slipLocked={slipLocked}
          standingLock={standingLock}
          canUnlock={canUnlock}
          openWithoutPick={openWithoutPick.length}
          onLock={onLock}
          onUnlock={unlock}
        />
        <WagerTranslator games={games} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game card
// ---------------------------------------------------------------------------

function GameCard({
  game,
  pick,
  canPick,
  pending,
  slipClosed,
  primaryDay,
  onPick,
}: {
  game: BookGame;
  pick: MemberBookPick | null;
  canPick: boolean;
  pending: boolean;
  /** The member's early lock still stands over this week's open games. */
  slipClosed: boolean;
  /** The lock day the alert above the board already announced. */
  primaryDay: string | null;
  onPick: (game: BookGame, side: BookSideKey) => void;
}) {
  const totalPicks = game.homePicks + game.awayPicks;
  const showConsensus = totalPicks >= MIN_PICKS_FOR_CONSENSUS;
  const homePct = showConsensus
    ? Math.round((game.homePicks / totalPicks) * 100)
    : 0;
  const awayPct = 100 - homePct;
  const leaderPct = Math.max(homePct, awayPct);
  const leaderName =
    homePct >= awayPct ? game.home.abbreviation ?? game.home.name : game.away.abbreviation ?? game.away.name;

  const interactive = canPick && game.status === "open";
  const showStatus =
    game.status !== "open" || lockDayName(game.kickoffLabel) !== primaryDay;
  const showHeader = showStatus || !!game.rivalryName || showConsensus;

  return (
    <section className="card-surface flex flex-col px-4 pt-1.5 pb-1.5 pr-3">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2">
          <span className="flex min-w-0 items-center gap-2">
            {showStatus && <StatusKicker game={game} primaryDay={primaryDay} />}
            <RivalryKicker game={game} />
          </span>
          {showConsensus && (
            <span className="text-caption text-text-tertiary">
              <span className="font-mono tabular-nums">{leaderPct}%</span> of the
              league on {leaderName}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col divide-y divide-divider">
        <SideRow
          game={game}
          side="home"
          team={game.home}
          picked={pick?.side === "home"}
          interactive={interactive}
          pending={pending}
          onPick={onPick}
        />
        <SideRow
          game={game}
          side="away"
          team={game.away}
          picked={pick?.side === "away"}
          interactive={interactive}
          pending={pending}
          onPick={onPick}
        />
      </div>

      {pick && (
        <YourPickRow game={game} pick={pick} slipClosed={slipClosed} showPayout />
      )}

      {showConsensus && (
        <div className="border-t border-divider pt-2.5 pb-2">
          <div
            className="h-[3px] overflow-hidden rounded-full bg-surface-muted"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-accent-gold"
              style={{ width: `${homePct}%` }}
            />
          </div>
          <p className="mt-1.5 text-caption text-text-tertiary">
            League consensus: {game.home.abbreviation ?? game.home.name}{" "}
            <span className="font-mono tabular-nums">{homePct}%</span>,{" "}
            {game.away.abbreviation ?? game.away.name}{" "}
            <span className="font-mono tabular-nums">{awayPct}%</span>
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pick slip
// ---------------------------------------------------------------------------

function PickSlip({
  games,
  picks,
  week,
  signedIn,
  slipLocked,
  standingLock,
  canUnlock,
  openWithoutPick,
  onLock,
  onUnlock,
}: {
  games: BookGame[];
  picks: Map<number, MemberBookPick>;
  week: number;
  signedIn: boolean;
  slipLocked: boolean;
  standingLock: boolean;
  canUnlock: boolean;
  openWithoutPick: number;
  onLock: () => void;
  onUnlock: () => void;
}) {
  return (
    <div className="card-surface p-5">
      <p className="text-kicker mb-3.5">
        Week <span className="font-mono tabular-nums">{week}</span> pick slip
      </p>

      {!signedIn ? (
        <p className="text-body-sm text-text-secondary">
          {BOOK_COPY.signedOut}{" "}
          <Link
            href="/claim"
            className="-my-3 inline-block rounded-md py-3 font-semibold text-accent-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Claim your team.
          </Link>
        </p>
      ) : (
        <>
          <ul className="mb-4 flex flex-col">
            {games.map((game) => (
              <SlipRow
                key={game.matchupId}
                game={game}
                pick={picks.get(game.matchupId) ?? null}
                slipClosed={standingLock}
              />
            ))}
          </ul>
          <LockButton
            slipLocked={slipLocked}
            canUnlock={canUnlock}
            openWithoutPick={openWithoutPick}
            onLock={onLock}
            onUnlock={onUnlock}
          />
        </>
      )}
    </div>
  );
}

function SlipRow({
  game,
  pick,
  slipClosed,
}: {
  game: BookGame;
  pick: MemberBookPick | null;
  slipClosed: boolean;
}) {
  if (!pick) {
    const openLabel = game.status === "open" ? "Open" : "No pick";
    return (
      <li className="flex items-center justify-between gap-3 border-t border-divider py-2.5">
        <span className="min-w-0">
          <span className="block truncate text-body-sm text-text-tertiary">
            Pick a side
          </span>
          <span className="block truncate text-caption text-text-tertiary">
            {game.home.name} vs {game.away.name}
          </span>
        </span>
        <span
          className={`shrink-0 text-caption font-semibold ${
            game.status === "open" ? "text-accent-gold" : "text-text-tertiary"
          }`}
        >
          {openLabel}
        </span>
      </li>
    );
  }

  const team = pick.side === "home" ? game.home : game.away;
  const other = pick.side === "home" ? game.away : game.home;
  const spread = pick.side === "home" ? pick.spreadAtPick : -pick.spreadAtPick;

  let tag: string;
  let tone: string;
  if (game.status === "open") {
    const locked = slipClosed || pick.lockedAt !== null;
    tag = locked ? "Locked" : "Pending";
    tone = locked ? "text-accent-green" : "text-text-tertiary";
  } else {
    const result = gradeGamePick(game, pick);
    if (result === "push") {
      tag = "Push";
      tone = "text-text-tertiary";
    } else if (result === pick.side) {
      tag = "Covering";
      tone = "text-accent-green";
    } else {
      tag = "Behind";
      tone = "text-accent-warm";
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 border-t border-divider py-2.5">
      <span className="min-w-0 flex-1">
        {/* ONE link over crest and code, not two to the same place. The
            opponent line stays outside it: it names the other team, not this
            one. */}
        <TeamLink
          slug={team.slug}
          className="-my-3 flex min-w-0 items-center gap-3 rounded-md py-3 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <FranchiseLogo
            slug={team.slug}
            name={team.name}
            abbreviation={team.abbreviation ?? undefined}
            brandingColor={team.brandingColor ?? undefined}
            avatarUrl={team.avatarUrl ?? undefined}
            size={20}
            decorative
          />
          <span className="min-w-0 truncate text-body-sm font-bold">
            {team.abbreviation ?? team.name}{" "}
            <span className="font-mono tabular-nums">{formatSpread(spread)}</span>
          </span>
        </TeamLink>
        <span className="mt-0.5 block truncate text-caption text-text-tertiary">
          vs {other.name}
        </span>
      </span>
      <span className={`shrink-0 text-caption font-semibold ${tone}`}>
        {tag}
      </span>
    </li>
  );
}

function LockButton({
  slipLocked,
  canUnlock,
  openWithoutPick,
  onLock,
  onUnlock,
}: {
  slipLocked: boolean;
  canUnlock: boolean;
  openWithoutPick: number;
  onLock: () => void;
  onUnlock: () => void;
}) {
  // Status pills (not controls) share the button's footprint so the slip
  // doesn't jump when the lock state changes.
  const base =
    "flex min-h-11 w-full items-center justify-center rounded-full px-4 text-body-sm font-semibold";

  if (slipLocked) {
    return (
      <>
        <p className={`${base} bg-accent-green-light text-center text-accent-green`}>
          {BOOK_COPY.lockedIn}
        </p>
        {/* An early lock is a commitment, not a trap: a game nobody has played
            yet is still the member's to change, so it can be handed back until
            kickoff. Once every locked game is underway there is nothing to
            give back and the button goes away on its own. */}
        {canUnlock && (
          <button
            type="button"
            onClick={onUnlock}
            className={buttonVariants({
              variant: "outline",
              className: "mt-2.5 w-full",
            })}
          >
            {BOOK_COPY.unlockCta}
          </button>
        )}
        <p className="mt-2.5 text-caption text-text-tertiary">
          {canUnlock ? BOOK_COPY.unlockNote : BOOK_COPY.lockNoteLocked}
        </p>
      </>
    );
  }

  if (openWithoutPick > 0) {
    return (
      <>
        <p className={`${base} bg-surface-muted text-center text-text-tertiary`}>
          <span className="font-mono tabular-nums">{openWithoutPick}</span>{" "}
          {openWithoutPick === 1 ? "pick" : "picks"} still open
        </p>
        <p className="mt-2.5 text-caption text-text-tertiary">
          {BOOK_COPY.lockNoteIncomplete}
        </p>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onLock}
        className={buttonVariants({ className: "w-full" })}
      >
        {BOOK_COPY.lockCta}
      </button>
      <p className="mt-2.5 text-caption text-text-tertiary">
        {BOOK_COPY.lockNoteReady}
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
// Wager translator
// ---------------------------------------------------------------------------

interface CalcOption {
  value: string;
  label: string;
  moneyline: number;
  team: string;
}

function WagerTranslator({ games }: { games: BookGame[] }) {
  const options = useMemo<CalcOption[]>(() => {
    const list: CalcOption[] = [];
    for (const game of games) {
      if (game.status !== "open") continue;
      list.push({
        value: `${game.matchupId}-home`,
        label: `${game.home.name} ${formatMoneyline(game.home.moneyline)}`,
        moneyline: game.home.moneyline,
        team: game.home.name,
      });
      list.push({
        value: `${game.matchupId}-away`,
        label: `${game.away.name} ${formatMoneyline(game.away.moneyline)}`,
        moneyline: game.away.moneyline,
        team: game.away.name,
      });
    }
    return list;
  }, [games]);

  const [selected, setSelected] = useState<string>("");
  const [stake, setStake] = useState<number>(DEFAULT_STAKE);

  const option = options.find((o) => o.value === selected) ?? options[0] ?? null;

  if (!option) {
    return (
      <div className="card-surface p-5">
        <p className="text-kicker mb-1">{BOOK_COPY.translatorTitle}</p>
        <p className="text-body-sm text-text-tertiary">
          Nothing left to price this week. Every game is on the field.
        </p>
      </div>
    );
  }

  const safeStake = Number.isFinite(stake)
    ? Math.min(MAX_STAKE, Math.max(MIN_STAKE, stake))
    : DEFAULT_STAKE;
  const win = pay(option.moneyline, safeStake);

  return (
    <div className="card-surface p-5">
      <p className="text-kicker mb-1">{BOOK_COPY.translatorTitle}</p>
      <p className="mb-3.5 text-body-sm text-text-secondary">
        {BOOK_COPY.translatorSnark}
      </p>

      <div className="flex flex-col gap-2.5">
        <label className="sr-only" htmlFor="book-calc-bet">
          Choose a bet
        </label>
        <select
          id="book-calc-bet"
          value={option.value}
          onChange={(e) => setSelected(e.target.value)}
          className="min-h-11 w-full rounded-[10px] border border-border-control bg-surface px-2.5 text-body-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-canvas">
              {o.label}
            </option>
          ))}
        </select>

        <label
          className="flex items-center gap-2.5 text-body-sm text-text-secondary"
          htmlFor="book-calc-stake"
        >
          Stake
          <input
            id="book-calc-stake"
            type="number"
            min={MIN_STAKE}
            max={MAX_STAKE}
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            className="min-h-11 w-24 rounded-[10px] border border-border-control bg-surface px-2.5 font-mono text-body-sm tabular-nums text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          />
          <span className="text-caption text-text-tertiary">
            USD
          </span>
        </label>
      </div>

      <div className="mt-4 border-t border-divider pt-3.5">
        <p className="text-stat text-[30px] leading-none text-accent-green">
          +{formatMoney(win)}
        </p>
        <p className="text-caption mt-1 text-text-tertiary">
          profit
        </p>
        <p className="mt-2 text-body-sm text-text-tertiary">
          Risk <span className="font-mono tabular-nums">{formatMoney(safeStake)}</span>{" "}
          on {option.team} and it returns{" "}
          <span className="font-mono tabular-nums">
            {formatMoney(safeStake + win)}
          </span>{" "}
          total (<span className="font-mono tabular-nums">{formatMoney(win)}</span>{" "}
          profit).
        </p>
        <p className="mt-2.5 text-caption text-text-tertiary">
          <MonoNumerals text={BOOK_COPY.spreadNote} />
        </p>
      </div>
    </div>
  );
}
