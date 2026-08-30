"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { useBookSlip } from "@/components/book/use-book-slip";
import { formatSpread } from "@/lib/book/pricing";
import {
  BOOK_COPY,
  type AtsLeaderboardRow,
  type BookGame,
  type BookSideKey,
  type MemberBookPick,
  type PickemsCell,
  type PickemsDivision,
  type PickemsGridData,
  type PickemsRow,
  type PickerColumn,
} from "@/lib/book/shared";

/**
 * The Book's Tracking tab: the league pick'ems sheet.
 *
 * Three stacked pieces: the viewer's own pick strip (tap a side, straight into
 * the same `togglePick` server action the Board uses), the season ATS
 * leaderboard, and the transposed pick'ems grid (a column per member, clustered
 * by division; a row per game).
 *
 * A client island (enumerated in CLAUDE.md) for two reasons now. /book is
 * ISR-cached HTML served to the whole league, so the viewer's identity ("YOU")
 * and their own not-yet-kicked-off picks cannot live in the cached server tree;
 * and picking is an interaction. Nothing here is a permission check: the server
 * action re-enforces every rule, kickoff locks included.
 *
 * Streak Watch is not part of this island: it carries no session-dependent
 * state, so it renders as a plain server component alongside this one.
 */
export function TrackingIsland({
  leaderboard,
  grid,
  games,
  week,
}: {
  leaderboard: AtsLeaderboardRow[];
  grid: PickemsGridData;
  games: BookGame[];
  week: number;
}) {
  // The same slip state machine the Board runs (components/book/use-book-slip.ts):
  // one implementation, so a pick made here and a pick made there can never
  // disagree about ordering, rollback, or what the server actually booked.
  const {
    signedIn,
    franchiseSlug,
    picks: ownPicks,
    slipLocked,
    error,
    pendingMatchup,
    pick: onPick,
  } = useBookSlip(week);

  return (
    <div className="flex flex-col gap-4">
      <YourPicksStrip
        games={games}
        week={week}
        picks={ownPicks}
        signedIn={signedIn}
        slipLocked={slipLocked}
        pendingMatchup={pendingMatchup}
        error={error}
        onPick={onPick}
      />
      <AtsLeaderboard rows={leaderboard} viewerSlug={franchiseSlug} />
      <PickemsGrid
        grid={grid}
        week={week}
        viewerSlug={franchiseSlug}
        ownPicks={ownPicks}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your Picks strip
// ---------------------------------------------------------------------------

function YourPicksStrip({
  games,
  week,
  picks,
  signedIn,
  slipLocked,
  pendingMatchup,
  error,
  onPick,
}: {
  games: BookGame[];
  week: number;
  picks: Map<number, MemberBookPick>;
  signedIn: boolean;
  slipLocked: boolean;
  pendingMatchup: number | null;
  error: string | null;
  onPick: (game: BookGame, side: BookSideKey) => void;
}) {
  return (
    <section>
      <p className="text-kicker mb-3">
        Week <span className="font-mono tabular-nums">{week}</span> ·{" "}
        {BOOK_COPY.pickemsTitle}
      </p>
      <div className="card-surface p-5">
        <p className="mb-3.5 font-serif text-body-sm italic text-text-tertiary">
          {BOOK_COPY.pickemsSnark}
        </p>

        {error && (
          <p role="status" className="mb-3 text-body-sm text-accent-warm">
            {error}
          </p>
        )}

        {games.length === 0 ? (
          <p className="text-body-sm text-text-secondary">
            {BOOK_COPY.pickemsNoGames}
          </p>
        ) : (
          <ul className="flex list-none flex-col">
            {games.map((game) => (
              <PickRow
                key={game.matchupId}
                game={game}
                pick={picks.get(game.matchupId) ?? null}
                signedIn={signedIn}
                slipLocked={slipLocked}
                pending={pendingMatchup === game.matchupId}
                onPick={onPick}
              />
            ))}
          </ul>
        )}

        {!signedIn && (
          <p className="mt-3.5 text-body-sm text-text-secondary">
            {BOOK_COPY.pickemsSignedOut}{" "}
            <Link href="/claim" className="font-semibold text-accent-gold">
              Claim your team.
            </Link>
          </p>
        )}
      </div>
    </section>
  );
}

function PickRow({
  game,
  pick,
  signedIn,
  slipLocked,
  pending,
  onPick,
}: {
  game: BookGame;
  pick: MemberBookPick | null;
  signedIn: boolean;
  slipLocked: boolean;
  pending: boolean;
  onPick: (game: BookGame, side: BookSideKey) => void;
}) {
  const locked = game.status !== "open" || slipLocked || pick?.lockedAt != null;
  const interactive = signedIn && !locked;

  let statusLabel: string;
  if (game.status === "live") statusLabel = "Live";
  else if (game.status === "final") statusLabel = "Final";
  else if (locked) statusLabel = BOOK_COPY.pickemsLocked;
  else statusLabel = game.kickoffLabel ? `Locks ${game.kickoffLabel}` : "Open";

  const statusTone =
    game.status === "live"
      ? "text-accent-green"
      : locked
        ? "text-text-tertiary"
        : "text-accent-gold";

  return (
    <li className="flex flex-wrap items-center gap-2 border-t border-divider py-2.5 first:border-t-0">
      <span className="flex min-w-0 flex-1 basis-full items-center gap-2 sm:basis-auto">
        <span className="min-w-0 truncate text-body-sm text-text-secondary">
          {game.away.name} at {game.home.name}
        </span>
        <span className={`shrink-0 text-caption font-semibold ${statusTone}`}>
          {locked && game.status === "open" ? "🔒 " : ""}
          {statusLabel}
        </span>
        {/* The gold tint on the picked button is a color signal, so the pick
            carries a written label too (CLAUDE.md: never color alone). */}
        {pick && (
          <span className="shrink-0 text-caption font-semibold text-accent-gold">
            ✓ Your pick
          </span>
        )}
      </span>
      <span className="flex shrink-0 gap-2">
        <SideButton
          game={game}
          side="away"
          picked={pick?.side === "away"}
          interactive={interactive}
          pending={pending}
          onPick={onPick}
        />
        <SideButton
          game={game}
          side="home"
          picked={pick?.side === "home"}
          interactive={interactive}
          pending={pending}
          onPick={onPick}
        />
      </span>
    </li>
  );
}

function SideButton({
  game,
  side,
  picked,
  interactive,
  pending,
  onPick,
}: {
  game: BookGame;
  side: BookSideKey;
  picked: boolean;
  interactive: boolean;
  pending: boolean;
  onPick: (game: BookGame, side: BookSideKey) => void;
}) {
  const team = side === "home" ? game.home : game.away;
  const label = `${team.abbreviation ?? team.name} ${formatSpread(team.spread)}`;
  const base =
    "min-w-[92px] rounded-[10px] border px-2.5 py-1.5 text-center font-mono text-body-sm font-bold tabular-nums transition-colors duration-150";
  const skin = picked
    ? "border-accent-gold/45 bg-accent-gold-light text-text-primary"
    : "border-border bg-white/[.03] text-text-secondary";

  if (!interactive) {
    return (
      <span
        className={`${base} ${skin} ${picked ? "" : "opacity-55"}`}
        aria-label={`${team.name} ${formatSpread(team.spread)}${picked ? ", your pick" : ""}`}
      >
        {label}
        {picked && <span className="ml-1 font-sans">✓</span>}
      </span>
    );
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
      {label}
      {picked && <span className="ml-1 font-sans">✓</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Season ATS leaderboard
// ---------------------------------------------------------------------------

function AtsLeaderboard({
  rows,
  viewerSlug,
}: {
  rows: AtsLeaderboardRow[];
  viewerSlug: string | null;
}) {
  if (rows.length === 0) {
    return (
      <section>
        <p className="text-kicker mb-3">Season · Against the Spread</p>
        <div className="card-surface p-6">
          <p className="text-body-sm text-text-secondary">
            No graded picks yet. The ledger opens once a week finishes.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <p className="text-kicker mb-3">Season · Against the Spread</p>
      <div className="card-surface overflow-hidden p-0">
        {/* Desktop: fixed-column grid rows, matching the design's 28/36/1fr/64/72/72 layout. */}
        <div className="hidden md:block">
          <div className="grid grid-cols-[28px_36px_1fr_64px_72px_72px] items-center gap-3 border-b border-divider px-4 py-2.5">
            <span />
            <span />
            <span className="text-[11px] font-semibold uppercase tracking-[.18em] text-text-muted">
              Picker
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[.18em] text-text-muted">
              Streak
            </span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-[.18em] text-text-muted">
              Units
            </span>
            <span className="text-right text-[11px] font-semibold uppercase tracking-[.18em] text-text-muted">
              ATS
            </span>
          </div>
          <ul className="list-none">
            {rows.map((row) => (
              <LeaderboardDesktopRow
                key={row.memberId}
                row={row}
                isYou={row.franchiseSlug === viewerSlug}
              />
            ))}
          </ul>
        </div>

        {/* Mobile: cards, per CLAUDE.md's "cards over tables" rule at >3-4 columns. */}
        <ul className="flex list-none flex-col md:hidden">
          {rows.map((row) => (
            <LeaderboardMobileCard
              key={row.memberId}
              row={row}
              isYou={row.franchiseSlug === viewerSlug}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function LeaderboardDesktopRow({
  row,
  isYou,
}: {
  row: AtsLeaderboardRow;
  isYou: boolean;
}) {
  const rowBg = row.isLeader
    ? "bg-accent-gold-light"
    : isYou
      ? "bg-white/[.03]"
      : "";
  const rankColor = row.isLeader
    ? "text-accent-gold"
    : row.isLast
      ? "text-accent-warm"
      : "text-text-tertiary";
  const nameWeight = row.isLeader || isYou ? "font-bold" : "font-medium";
  const nameColor = row.isLeader
    ? "text-text-primary"
    : row.isLast
      ? "text-accent-warm"
      : "text-text-secondary";
  const streakColor =
    row.streakType === "W" ? "text-accent-green" : "text-accent-warm";
  const positiveUnits = row.units >= 0;
  const unitsColor = positiveUnits ? "text-accent-green" : "text-accent-warm";
  const recordColor = row.isLeader ? "text-text-primary" : "text-text-tertiary";

  return (
    <li
      className={`grid grid-cols-[28px_36px_1fr_64px_72px_72px] items-center gap-3 border-t border-divider px-4 py-2.5 ${rowBg}`}
    >
      <span
        className={`text-center font-mono text-body-sm font-bold tabular-nums ${rankColor}`}
      >
        {row.rank}
      </span>
      {/* Decorative: the franchise name is the very next cell, so alt text here
          would only double-announce it. */}
      <FranchiseLogo
        slug={row.franchiseSlug}
        name={row.franchiseName}
        abbreviation={row.franchiseAbbreviation ?? undefined}
        brandingColor={row.franchiseColor ?? undefined}
        avatarUrl={row.franchiseAvatarUrl ?? undefined}
        size={28}
        decorative
      />
      <span
        className={`min-w-0 truncate text-body-sm ${nameWeight} ${nameColor}`}
      >
        {row.franchiseName}
        {isYou && (
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-[.1em] text-accent-gold">
            You
          </span>
        )}
      </span>
      <span
        className={`font-mono text-body-sm font-semibold tabular-nums ${streakColor}`}
      >
        {row.streakLabel ?? "—"}
      </span>
      <span
        className={`text-right font-mono text-body-sm font-semibold tabular-nums ${unitsColor}`}
      >
        {positiveUnits ? "+" : ""}
        {row.units.toFixed(2)}
      </span>
      <span
        className={`text-right font-mono text-body-sm font-bold tabular-nums ${recordColor}`}
      >
        {row.record}
      </span>
    </li>
  );
}

function LeaderboardMobileCard({
  row,
  isYou,
}: {
  row: AtsLeaderboardRow;
  isYou: boolean;
}) {
  const cardBg = row.isLeader
    ? "bg-accent-gold-light"
    : isYou
      ? "bg-white/[.03]"
      : "";
  const streakColor =
    row.streakType === "W" ? "text-accent-green" : "text-accent-warm";
  const positiveUnits = row.units >= 0;
  const unitsColor = positiveUnits ? "text-accent-green" : "text-accent-warm";

  return (
    <li
      className={`flex items-center gap-3 border-t border-divider px-4 py-3 first:border-t-0 ${cardBg}`}
    >
      <span
        className={`w-5 shrink-0 text-center font-mono text-body-sm font-bold tabular-nums ${
          row.isLeader ? "text-accent-gold" : row.isLast ? "text-accent-warm" : "text-text-tertiary"
        }`}
      >
        {row.rank}
      </span>
      {/* Decorative for the same reason as the desktop row: the name sits
          immediately beside it. */}
      <FranchiseLogo
        slug={row.franchiseSlug}
        name={row.franchiseName}
        abbreviation={row.franchiseAbbreviation ?? undefined}
        brandingColor={row.franchiseColor ?? undefined}
        avatarUrl={row.franchiseAvatarUrl ?? undefined}
        size={28}
        decorative
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-body-sm font-semibold text-text-primary">
            {row.franchiseName}
          </span>
          {isYou && (
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[.1em] text-accent-gold">
              You
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px]">
          <span className="font-mono font-bold tabular-nums text-text-tertiary">
            {row.record}
          </span>
          <span className={`font-mono font-semibold tabular-nums ${streakColor}`}>
            {row.streakLabel ?? "—"}
          </span>
        </span>
      </span>
      <span
        className={`shrink-0 font-mono text-body-sm font-semibold tabular-nums ${unitsColor}`}
      >
        {positiveUnits ? "+" : ""}
        {row.units.toFixed(2)}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Pick'ems grid
// ---------------------------------------------------------------------------

// Desktop shows all twelve columns in a scrollable matrix; the compact variant
// is the one-division mobile view, sized so a six-team division fits a phone
// without asking for a horizontal drag.
const COLUMN_WIDTH = 64;
const LABEL_WIDTH = 150;
const COMPACT_COLUMN_WIDTH = 40;
const COMPACT_LABEL_WIDTH = 92;

function PickemsGrid({
  grid,
  week,
  viewerSlug,
  ownPicks,
}: {
  grid: PickemsGridData;
  week: number;
  viewerSlug: string | null;
  ownPicks: Map<number, MemberBookPick>;
}) {
  const viewerDivision = useMemo(
    () =>
      grid.divisions.find((d) =>
        d.pickers.some((p) => p.franchiseSlug === viewerSlug),
      )?.name ?? null,
    [grid.divisions, viewerSlug],
  );

  // Null until the viewer picks one: that way the default follows the session
  // as soon as it resolves, without an effect writing state on every render.
  const [chosenDivision, setChosenDivision] = useState<string | null>(null);
  const activeDivisionName =
    chosenDivision ?? viewerDivision ?? grid.divisions[0]?.name ?? null;
  const activeDivision =
    grid.divisions.find((d) => d.name === activeDivisionName) ?? null;

  if (grid.rows.length === 0 || grid.divisions.length === 0) return null;

  return (
    <section>
      <p className="text-kicker mb-3">
        Week <span className="font-mono tabular-nums">{week}</span> ·{" "}
        {BOOK_COPY.pickemsGridKicker}
      </p>

      {/* Deep-dive exception to the mobile cards-over-tables rule: this is a
          wide matrix, not a list. Desktop scrolls it in its own container;
          narrow viewports show one division at a time instead. */}
      <div className="card-surface p-0">
        <div className="hidden overflow-x-auto md:block">
          <PickemsTable
            divisions={grid.divisions}
            rows={grid.rows}
            viewerSlug={viewerSlug}
            ownPicks={ownPicks}
            showDivisionHeader
          />
        </div>

        <div className="md:hidden">
          <div className="border-b border-divider px-4 py-3">
            <label
              className="text-[11px] font-semibold uppercase tracking-[.18em] text-text-tertiary"
              htmlFor="pickems-division"
            >
              Division
            </label>
            <select
              id="pickems-division"
              value={activeDivisionName ?? ""}
              onChange={(e) => setChosenDivision(e.target.value)}
              className="mt-1.5 w-full rounded-[10px] border border-border-strong bg-surface px-2.5 py-2 text-body-sm text-text-primary focus:border-accent-gold focus:outline-none"
            >
              {grid.divisions.map((d) => (
                <option key={d.name} value={d.name} className="bg-canvas">
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          {activeDivision && (
            <div className="overflow-x-auto">
              <PickemsTable
                divisions={[activeDivision]}
                rows={grid.rows}
                viewerSlug={viewerSlug}
                ownPicks={ownPicks}
                showDivisionHeader={false}
                compact
              />
            </div>
          )}
        </div>

        <p className="border-t border-divider px-4 py-2.5 text-[11px] text-text-tertiary">
          {BOOK_COPY.pickemsLegend}
        </p>
        <p className="border-t border-divider px-4 py-2.5 text-[11px] text-text-tertiary">
          {BOOK_COPY.pickemsFootnote}
        </p>
      </div>
    </section>
  );
}

function PickemsTable({
  divisions,
  rows,
  viewerSlug,
  ownPicks,
  showDivisionHeader,
  compact = false,
}: {
  divisions: PickemsDivision[];
  rows: PickemsRow[];
  viewerSlug: string | null;
  ownPicks: Map<number, MemberBookPick>;
  showDivisionHeader: boolean;
  compact?: boolean;
}) {
  const pickers = divisions.flatMap((d) => d.pickers);
  const labelWidth = compact ? COMPACT_LABEL_WIDTH : LABEL_WIDTH;
  const columnWidth = compact ? COMPACT_COLUMN_WIDTH : COLUMN_WIDTH;
  const gap = compact ? 4 : 8;
  const gapClass = compact ? "gap-1" : "gap-2";
  const padClass = compact ? "px-2" : "px-4";
  const template = `minmax(${labelWidth}px,1fr) repeat(${pickers.length}, ${columnWidth}px)`;
  const minWidth = `${labelWidth + pickers.length * (columnWidth + gap)}px`;

  return (
    <div style={{ minWidth }}>
      {showDivisionHeader && (
        <div
          className={`grid items-end ${gapClass} ${padClass} pt-3`}
          style={{ gridTemplateColumns: template }}
        >
          <span />
          {divisions.map((division) => (
            <span
              key={division.name}
              className="truncate text-center text-[10px] font-semibold uppercase tracking-[.14em] text-text-tertiary"
              style={{ gridColumn: `span ${division.pickers.length}` }}
            >
              {division.name}
            </span>
          ))}
        </div>
      )}

      <div
        className={`grid items-end ${gapClass} border-b border-divider ${padClass} pb-2.5 pt-2`}
        style={{ gridTemplateColumns: template }}
      >
        <span className="sticky left-0 z-[1] bg-canvas text-[11px] font-semibold uppercase tracking-[.18em] text-text-muted">
          Game
        </span>
        {pickers.map((picker) => (
          <PickerHeader
            key={picker.memberId}
            picker={picker}
            isYou={picker.franchiseSlug === viewerSlug}
          />
        ))}
      </div>

      <ul className="list-none">
        {rows.map((row) => (
          <li
            key={row.matchupId}
            className={`grid items-center ${gapClass} border-t border-divider ${padClass} py-2`}
            style={{ gridTemplateColumns: template }}
          >
            {/* Sticky so the game a cell belongs to stays readable while the
                matrix scrolls sideways. */}
            <span className="sticky left-0 z-[1] flex min-w-0 items-center gap-2 bg-canvas">
              <span className="truncate font-mono text-[11px] font-bold tabular-nums text-text-primary">
                {row.label}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-tertiary">
                {row.spreadLabel}
              </span>
              {row.status === "live" && (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[.1em] text-accent-green">
                  Live
                </span>
              )}
            </span>
            {pickers.map((picker) => (
              <GridCell
                key={picker.memberId}
                memberId={picker.memberId}
                cell={row.cells[String(picker.memberId)] ?? null}
                row={row}
                overlay={
                  picker.franchiseSlug === viewerSlug
                    ? (ownPicks.get(row.matchupId) ?? null)
                    : null
                }
              />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PickerHeader({
  picker,
  isYou,
}: {
  picker: PickerColumn;
  isYou: boolean;
}) {
  return (
    <span
      className="flex flex-col items-center gap-1"
      data-testid="picker-header"
      data-picker-slug={picker.franchiseSlug}
    >
      {/*
        Deliberately NOT decorative, unlike every other crest in The Book. The
        only visible label in this column is a three-letter code or the word
        "YOU"; the franchise name lives in a `title` that touch users never see.
        Passing the real name as alt is what makes the column announce a
        franchise at all, and it distinguishes two franchises whose codes
        collide (see #243) without waiting on that fix.

        24px is both the floor and the ceiling: below 28px the monogram is
        pinned at 9px either way (which is what the old chip used), and the
        compact mobile column is only 40px wide.
      */}
      <FranchiseLogo
        slug={picker.franchiseSlug}
        name={picker.franchiseName}
        abbreviation={picker.abbreviation}
        brandingColor={picker.color ?? undefined}
        avatarUrl={picker.avatarUrl ?? undefined}
        size={24}
      />
      <span
        className={`max-w-full truncate text-[10px] font-semibold ${
          isYou ? "text-accent-gold" : "text-text-tertiary"
        }`}
        title={`${picker.franchiseName} (${picker.displayName})`}
      >
        {isYou ? "YOU" : picker.abbreviation}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-text-tertiary">
        {picker.record || "—"}
      </span>
    </span>
  );
}

/**
 * One member's cell. The server never ships another member's open pick, so an
 * unrevealed cell can only ever be filled from the viewer's OWN /api/book/picks
 * overlay. Outcomes are final-only and always carry a glyph or word, never
 * color alone.
 */
function GridCell({
  memberId,
  cell,
  row,
  overlay,
}: {
  memberId: number;
  cell: PickemsCell | null;
  row: PickemsRow;
  overlay: MemberBookPick | null;
}) {
  const revealed = cell?.revealed ?? false;
  const abbreviation =
    cell?.abbreviation ??
    (!revealed && overlay
      ? overlay.side === "home"
        ? row.homeAbbreviation
        : row.awayAbbreviation
      : null);

  if (!abbreviation) {
    return (
      <span
        data-testid="pickems-cell"
        data-member-id={memberId}
        data-matchup-id={row.matchupId}
        className="text-center font-mono text-[11px] font-semibold text-text-muted"
      >
        —
      </span>
    );
  }

  let tone = "bg-transparent text-text-tertiary";
  let suffix = "";
  if (cell?.outcome === "win") {
    tone = "bg-accent-green-light text-accent-green";
    suffix = " ✓";
  } else if (cell?.outcome === "loss") {
    tone = "bg-accent-warm-light text-accent-warm";
    suffix = " ✗";
  }

  return (
    <span
      data-testid="pickems-cell"
      data-member-id={memberId}
      data-matchup-id={row.matchupId}
      className={`rounded-[6px] py-0.5 text-center font-mono text-[11px] font-semibold ${tone}`}
    >
      {abbreviation}
      {suffix}
      {cell?.outcome === "push" && (
        <span className="block text-[9px] font-semibold uppercase tracking-[.1em] text-text-tertiary">
          Push
        </span>
      )}
    </span>
  );
}
