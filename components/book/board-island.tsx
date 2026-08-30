"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { useBookSlip } from "@/components/book/use-book-slip";
import {
  gradePick,
  formatMoney,
  formatMoneyline,
  formatSpread,
  pay,
  payoutLabel,
} from "@/lib/book/pricing";
import {
  BOOK_COPY,
  DEFAULT_STAKE,
  MAX_STAKE,
  MIN_PICKS_FOR_CONSENSUS,
  MIN_STAKE,
  type BookGame,
  type BookSide,
  type BookSideKey,
  type CoverResult,
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
    error,
    pendingMatchup,
    canPick,
    pick: onPick,
    lock,
  } = useBookSlip(week);

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
        {error && (
          <p
            role="status"
            className="card-surface p-3 text-body-sm text-accent-warm"
          >
            {error}
          </p>
        )}
        {games.map((game) => (
          <GameCard
            key={game.matchupId}
            game={game}
            pick={picks.get(game.matchupId) ?? null}
            canPick={canPick}
            pending={pendingMatchup === game.matchupId}
            slipLocked={slipLocked}
            onPick={onPick}
          />
        ))}
      </div>

      <aside className="flex flex-col gap-6">
        <PickSlip
          games={games}
          picks={picks}
          week={week}
          signedIn={signedIn}
          slipLocked={slipLocked}
          openWithoutPick={openWithoutPick.length}
          onLock={onLock}
        />
        <WagerTranslator games={games} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game card
// ---------------------------------------------------------------------------

/** Grades a pick against ITS OWN snapshotted line, never the game's current one. */
function gradeGamePick(game: BookGame, pick: MemberBookPick): CoverResult {
  return gradePick(game.home.points, game.away.points, pick);
}

function GameCard({
  game,
  pick,
  canPick,
  pending,
  slipLocked,
  onPick,
}: {
  game: BookGame;
  pick: MemberBookPick | null;
  canPick: boolean;
  pending: boolean;
  slipLocked: boolean;
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

  return (
    <div className="card-surface p-5">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <StatusKicker game={game} />
        {showConsensus && (
          <span className="text-body-sm text-text-tertiary">
            <span className="font-mono tabular-nums">{leaderPct}%</span> of the
            league on {leaderName}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
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
        <YourPickRow game={game} pick={pick} slipLocked={slipLocked} />
      )}

      {showConsensus && (
        <div className="mt-3">
          <div
            className="h-[3px] overflow-hidden rounded-full bg-surface-muted"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-accent-gold"
              style={{ width: `${homePct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-text-tertiary">
            League consensus ·{" "}
            <span className="font-mono tabular-nums">
              {game.home.abbreviation ?? game.home.name} {homePct}% ·{" "}
              {game.away.abbreviation ?? game.away.name} {awayPct}%
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function StatusKicker({ game }: { game: BookGame }) {
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
    return <span className="text-kicker">Final</span>;
  }

  return (
    <span className="text-kicker text-accent-gold">
      {game.kickoffLabel ? `Locks ${game.kickoffLabel}` : "Locks at kickoff"}
    </span>
  );
}

function SideRow({
  game,
  side,
  team,
  picked,
  interactive,
  pending,
  onPick,
}: {
  game: BookGame;
  side: BookSideKey;
  team: BookSide;
  picked: boolean;
  interactive: boolean;
  pending: boolean;
  onPick: (game: BookGame, side: BookSideKey) => void;
}) {
  const covering = game.coveringSide === side && game.status !== "open";

  const content = (
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

  const base =
    "flex w-full items-center gap-3 rounded-[11px] border p-2.5 text-left transition-colors duration-150";
  const skin = picked
    ? "border-accent-gold/45 bg-accent-gold-light"
    : "border-border bg-white/[.03]";
  // Dim only a game that is off the board, never one that is merely
  // unpickable-by-you: a signed-out visitor should read a live sportsbook, not
  // a greyed-out one.
  const dim = game.status !== "open" && !picked ? "opacity-55" : "";

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

function YourPickRow({
  game,
  pick,
  slipLocked,
}: {
  game: BookGame;
  pick: MemberBookPick;
  slipLocked: boolean;
}) {
  const team = pick.side === "home" ? game.home : game.away;
  const spread = pick.side === "home" ? pick.spreadAtPick : -pick.spreadAtPick;

  let tag: string;
  let tone: string;
  if (game.status === "open") {
    const locked = slipLocked || pick.lockedAt !== null;
    tag = locked ? "Locked in" : "Locks at kickoff";
    tone = locked ? "text-accent-green" : "text-text-tertiary";
  } else {
    const result = gradeGamePick(game, pick);
    const settled = game.status === "final";
    if (result === "push") {
      tag = "Push";
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
    <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] bg-white/[.03] px-3 py-2">
      <span className="min-w-0 truncate text-caption normal-case tracking-normal text-text-secondary">
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

// ---------------------------------------------------------------------------
// Pick slip
// ---------------------------------------------------------------------------

function PickSlip({
  games,
  picks,
  week,
  signedIn,
  slipLocked,
  openWithoutPick,
  onLock,
}: {
  games: BookGame[];
  picks: Map<number, MemberBookPick>;
  week: number;
  signedIn: boolean;
  slipLocked: boolean;
  openWithoutPick: number;
  onLock: () => void;
}) {
  return (
    <div className="card-surface p-5">
      <p className="text-kicker mb-3.5">
        Pick Slip · Week <span className="font-mono tabular-nums">{week}</span>
      </p>

      {!signedIn ? (
        <p className="text-body-sm text-text-secondary">
          {BOOK_COPY.signedOut}{" "}
          <Link href="/claim" className="font-semibold text-accent-gold">
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
                slipLocked={slipLocked}
              />
            ))}
          </ul>
          <LockButton
            slipLocked={slipLocked}
            openWithoutPick={openWithoutPick}
            onLock={onLock}
          />
        </>
      )}
    </div>
  );
}

function SlipRow({
  game,
  pick,
  slipLocked,
}: {
  game: BookGame;
  pick: MemberBookPick | null;
  slipLocked: boolean;
}) {
  if (!pick) {
    const openLabel = game.status === "open" ? "Open" : "No pick";
    return (
      <li className="flex items-center justify-between gap-3 border-t border-divider py-2.5">
        <span className="min-w-0">
          <span className="block truncate text-body-sm text-text-tertiary">
            Pick a side
          </span>
          <span className="block truncate text-[11px] text-text-tertiary">
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
    const locked = slipLocked || pick.lockedAt !== null;
    tag = locked ? "Locked" : "Pending";
    tone = locked ? "text-accent-green" : "text-text-tertiary";
  } else {
    const result = gradeGamePick(game, pick);
    if (result === "push") {
      tag = "Push";
      tone = "text-text-tertiary";
    } else if (result === pick.side) {
      tag = "✓ Covering";
      tone = "text-accent-green";
    } else {
      tag = "✗ Behind";
      tone = "text-accent-warm";
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 border-t border-divider py-2.5">
      <span className="min-w-0">
        <span className="block truncate font-mono text-body-sm font-bold tabular-nums text-text-primary">
          {team.abbreviation ?? team.name} {formatSpread(spread)}
        </span>
        <span className="block truncate text-[11px] text-text-tertiary">
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
  openWithoutPick,
  onLock,
}: {
  slipLocked: boolean;
  openWithoutPick: number;
  onLock: () => void;
}) {
  const base = "w-full rounded-full px-4 py-2.5 text-body-sm font-semibold";

  if (slipLocked) {
    return (
      <>
        <p className={`${base} bg-accent-green-light text-center text-accent-green`}>
          {BOOK_COPY.lockedIn}
        </p>
        <p className="mt-2.5 text-[11px] text-text-tertiary">
          {BOOK_COPY.lockNoteLocked}
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
        <p className="mt-2.5 text-[11px] text-text-tertiary">
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
        className={`${base} cursor-pointer bg-accent-gold text-canvas transition-[filter] duration-150 hover:brightness-110`}
      >
        {BOOK_COPY.lockCta}
      </button>
      <p className="mt-2.5 text-[11px] text-text-tertiary">
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
      <p className="mb-3.5 font-serif text-body-sm italic text-text-tertiary">
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
          className="w-full rounded-[10px] border border-border-strong bg-surface px-2.5 py-2 text-body-sm text-text-primary focus:border-accent-gold focus:outline-none"
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
            className="w-24 rounded-[10px] border border-border-strong bg-surface px-2.5 py-2 font-mono text-body-sm tabular-nums text-text-primary focus:border-accent-gold focus:outline-none"
          />
          <span className="text-caption normal-case tracking-normal text-text-tertiary">
            USD
          </span>
        </label>
      </div>

      <div className="mt-4 border-t border-divider pt-3.5">
        <p className="text-stat text-[30px] leading-none text-accent-green">
          +{formatMoney(win)}
        </p>
        <p className="text-caption mt-1 normal-case tracking-normal text-text-tertiary">
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
        <p className="mt-2.5 text-[11px] text-text-tertiary">
          {BOOK_COPY.spreadNote}
        </p>
      </div>
    </div>
  );
}
