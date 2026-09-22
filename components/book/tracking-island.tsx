"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";
import { useBookSlip } from "@/components/book/use-book-slip";
import {
  SideRow,
  StatusKicker,
  RivalryKicker,
  YourPickRow,
} from "@/components/book/side-row";
import {
  BOOK_COPY,
  bucketRailPickers,
  divisionRailLabel,
  type AtsLeaderboardRow,
  type BookGame,
  type BookSideKey,
  type MemberBookPick,
  type PickemsDivision,
  type PickemsGridData,
  type PickemsRow,
  type PickerColumn,
  type PickOutcome,
  type RailBucket,
} from "@/lib/book/shared";

/**
 * The Book's Tracking tab: the league pick'ems sheet.
 *
 * The unit of this tab is ONE CARD PER GAME. Both sides of a card are the pick
 * controls, and the members who took each side hang directly under that side
 * as a rail of crest chips, so picking, the split and the grading are one
 * object instead of a pick strip at the top and a transposed 12-column matrix
 * at the bottom that only agreed with it by coincidence.
 *
 * Three stacked pieces: Week Pulse (the week's counts plus the one lock
 * control for the whole tab), The Slate (the cards), and the season ledger.
 *
 * A client island (enumerated in CLAUDE.md) for two reasons. /book is
 * ISR-cached HTML served to the whole league, so the viewer's identity ("YOU")
 * and their own not-yet-kicked-off picks cannot live in the cached server tree;
 * and picking is an interaction. Nothing here is a permission check: the server
 * action re-enforces every rule, kickoff locks included.
 *
 * The anti-tailing rule is enforced in the QUERY, not here: an open game ships
 * no side for anybody (`PickemsCell.side` is null, `hasPicked` is a bare
 * boolean), so this island cannot leak what it was never given. It must not
 * widen that: no rail, no chip and no split renders for an open game.
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
    standingLock,
    canPick,
    canUnlock,
    error,
    pendingMatchup,
    pick: onPick,
    lock,
    unlock,
  } = useBookSlip(week, games);

  const members = useMemo(
    () => grid.divisions.flatMap((d) => d.pickers),
    [grid.divisions],
  );
  const rowByMatchup = useMemo(() => {
    const map = new Map<number, PickemsRow>();
    for (const row of grid.rows) map.set(row.matchupId, row);
    return map;
  }, [grid.rows]);

  const openWithoutPick = games.filter(
    (g) => g.status === "open" && !ownPicks.has(g.matchupId),
  ).length;

  function onLock() {
    if (openWithoutPick > 0) return;
    lock();
  }

  const hasGames = games.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* No games means no sheet: a "0/0 complete" pulse over an armed lock
          button that would commit nothing is worse than saying so once, in the
          slate's own empty sentence below. */}
      {hasGames && (
        <WeekPulse
          week={week}
          games={games}
          rows={grid.rows}
          members={members}
          viewerSlug={franchiseSlug}
          signedIn={signedIn}
          ownPicks={ownPicks}
          slipLocked={slipLocked}
          canUnlock={canUnlock}
          openWithoutPick={openWithoutPick}
          error={error}
          onLock={onLock}
          onUnlock={unlock}
        />
      )}

      <section>
        <p className="text-kicker mb-3">
          Week <span className="font-mono tabular-nums">{week}</span> ·{" "}
          {BOOK_COPY.slateKicker}
        </p>
        {games.length === 0 ? (
          <div className="card-surface p-5">
            <p className="text-body-sm text-text-secondary">
              {BOOK_COPY.pickemsNoGames}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:gap-4">
              {games.map((game) => (
                <SlateCard
                  key={game.matchupId}
                  game={game}
                  row={rowByMatchup.get(game.matchupId) ?? null}
                  divisions={grid.divisions}
                  members={members}
                  ownPicks={ownPicks}
                  pick={ownPicks.get(game.matchupId) ?? null}
                  viewerSlug={franchiseSlug}
                  signedIn={signedIn}
                  interactive={canPick && game.status === "open"}
                  pending={pendingMatchup === game.matchupId}
                  slipClosed={standingLock}
                  onPick={onPick}
                />
              ))}
            </div>
            {/* The reveal rule, stated ONCE per screen. Never per card. */}
            <p className="mt-3 text-body-sm text-text-tertiary">
              {BOOK_COPY.pickemsFootnote}
            </p>
          </>
        )}
      </section>

      <SeasonLedger
        rows={leaderboard}
        divisions={grid.divisions}
        viewerSlug={franchiseSlug}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: who has picked what
// ---------------------------------------------------------------------------

/**
 * Whether a member has a pick on a row.
 *
 * For everybody else this is the server's `hasPicked` boolean, which is safe
 * to ship for an open game because it carries no side. For the VIEWER it is
 * their own slip instead: that slip is optimistic and always current, so the
 * counts stop lying for the second between a tap and the cached tree catching
 * up, and it is the viewer's own information either way.
 */
function hasPicked(
  row: PickemsRow,
  member: PickerColumn,
  viewerSlug: string | null,
  signedIn: boolean,
  ownPicks: Map<number, MemberBookPick>,
): boolean {
  if (signedIn && member.franchiseSlug === viewerSlug) {
    return ownPicks.has(row.matchupId);
  }
  return row.cells[String(member.memberId)]?.hasPicked ?? false;
}

// ---------------------------------------------------------------------------
// Week Pulse
// ---------------------------------------------------------------------------

function WeekPulse({
  week,
  games,
  rows,
  members,
  viewerSlug,
  signedIn,
  ownPicks,
  slipLocked,
  canUnlock,
  openWithoutPick,
  error,
  onLock,
  onUnlock,
}: {
  week: number;
  games: BookGame[];
  rows: PickemsRow[];
  members: PickerColumn[];
  viewerSlug: string | null;
  signedIn: boolean;
  ownPicks: Map<number, MemberBookPick>;
  slipLocked: boolean;
  canUnlock: boolean;
  openWithoutPick: number;
  error: string | null;
  onLock: () => void;
  onUnlock: () => void;
}) {
  // A complete sheet covers EVERY game of the week, not merely every game
  // still open. Counting only the open ones would hand a member a full sheet
  // on Sunday night for a game they never picked, and drop them out of "still
  // ghosting" for exactly the game they ghosted.
  const ghosting = members.filter(
    (member) =>
      !rows.every((row) =>
        hasPicked(row, member, viewerSlug, signedIn, ownPicks),
      ),
  );
  const complete = members.length - ghosting.length;
  const liveNow = games.filter((g) => g.status === "live").length;

  return (
    <section>
      <p className="text-kicker mb-3">
        Week <span className="font-mono tabular-nums">{week}</span> ·{" "}
        {BOOK_COPY.sheetKicker}
      </p>
      <div className="card-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-6 lg:gap-12">
          <div className="flex flex-wrap gap-6 lg:gap-12">
            <PulseStat
              testId="pulse-sheets-in"
              label={BOOK_COPY.pulseSheets}
              value={`${complete}/${members.length}`}
              tone="text-text-primary"
            />
            {signedIn && (
              <PulseStat
                label="Your picks"
                value={`${ownPicks.size}/${games.length}`}
                tone="text-accent-gold"
              />
            )}
            <PulseStat
              label="Live now"
              value={String(liveNow)}
              tone={liveNow > 0 ? "text-accent-green" : "text-text-secondary"}
            />
          </div>

          {ghosting.length > 0 && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="text-kicker">{BOOK_COPY.pulseGhosting}</span>
              {/* The ONLY place this tab names who is out, and it names them
                  without naming a single side: an incomplete sheet is a count,
                  not a pick. */}
              <div className="flex flex-wrap gap-1.5">
                {ghosting.map((member) => (
                  <PickerChip
                    key={member.memberId}
                    testId="ghost-chip"
                    member={member}
                    isViewer={member.franchiseSlug === viewerSlug}
                    outcome={null}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <p role="status" className="mt-3 text-body-sm text-accent-warm">
            {error}
          </p>
        )}

        {signedIn ? (
          <LockRow
            slipLocked={slipLocked}
            canUnlock={canUnlock}
            openWithoutPick={openWithoutPick}
            onLock={onLock}
            onUnlock={onUnlock}
          />
        ) : (
          <p className="mt-4 border-t border-divider pt-3.5 text-body-sm text-text-secondary">
            <Link href="/claim" className="font-semibold text-accent-gold">
              {BOOK_COPY.pickemsSignedOutLink}
            </Link>
            {BOOK_COPY.pickemsSignedOut.slice(
              BOOK_COPY.pickemsSignedOutLink.length,
            )}
          </p>
        )}
      </div>
    </section>
  );
}

function PulseStat({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone: string;
  testId?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1" data-testid={testId}>
      <span className="text-kicker">{label}</span>
      <span className={`text-stat text-[26px] leading-none ${tone}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * The whole tab's lock control, on one row, once.
 *
 * The Board's PickSlip owns the same three states; this is that control
 * re-laid-out for a tab that has no slip rail to hang it off. One per card
 * would be wrong twice over: locking is a slip-level commitment, and a member
 * who locked early would otherwise have six cards they cannot change with no
 * explanation and nothing to press.
 */
function LockRow({
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
  // inline-flex plus an explicit floor: 14px text with py-2 measures ~36px,
  // and this is the only tap target on the tab that is not a side row.
  const pill =
    "inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-body-sm font-semibold";

  let left: React.ReactNode;
  let note: string;

  if (slipLocked) {
    left = (
      <>
        <span className={`${pill} bg-accent-green-light text-accent-green`}>
          {BOOK_COPY.lockedIn}
        </span>
        {/* An early lock is a commitment, not a trap: a game nobody has played
            yet is still the member's to change, so it can be handed back until
            kickoff. Once every locked game is underway there is nothing left
            to give back and the button goes away on its own. */}
        {canUnlock && (
          <button
            type="button"
            onClick={onUnlock}
            className={`${pill} cursor-pointer border border-border-strong bg-surface text-text-secondary transition-colors duration-150 hover:text-text-primary`}
          >
            {BOOK_COPY.unlockCta}
          </button>
        )}
      </>
    );
    note = canUnlock ? BOOK_COPY.unlockNote : BOOK_COPY.lockNoteLocked;
  } else if (openWithoutPick > 0) {
    left = (
      <span className={`${pill} bg-surface-muted text-text-tertiary`}>
        <span className="font-mono tabular-nums">{openWithoutPick}</span>{" "}
        {openWithoutPick === 1 ? "pick" : "picks"} still open
      </span>
    );
    note = BOOK_COPY.lockNoteIncomplete;
  } else {
    left = (
      <button
        type="button"
        onClick={onLock}
        className={`${pill} cursor-pointer bg-accent-gold text-canvas transition-[filter] duration-150 hover:brightness-110`}
      >
        {BOOK_COPY.lockCta}
      </button>
    );
    note = BOOK_COPY.lockNoteReady;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">{left}</div>
      <span className="min-w-0 text-[11px] text-text-tertiary">{note}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Slate
// ---------------------------------------------------------------------------

function SlateCard({
  game,
  row,
  divisions,
  members,
  ownPicks,
  pick,
  viewerSlug,
  signedIn,
  interactive,
  pending,
  slipClosed,
  onPick,
}: {
  game: BookGame;
  row: PickemsRow | null;
  divisions: PickemsDivision[];
  members: PickerColumn[];
  ownPicks: Map<number, MemberBookPick>;
  pick: MemberBookPick | null;
  viewerSlug: string | null;
  signedIn: boolean;
  interactive: boolean;
  pending: boolean;
  slipClosed: boolean;
  onPick: (game: BookGame, side: BookSideKey) => void;
}) {
  const open = game.status === "open";
  // Through the same helper Week Pulse counts with, overlay included: two
  // counts of the same thing on one screen must not disagree for the second
  // between a tap and the cached tree catching up.
  const inCount = row
    ? members.filter((member) =>
        hasPicked(row, member, viewerSlug, signedIn, ownPicks),
      ).length
    : 0;
  // Bucketed once per card, not once per side row.
  const rail = row && !open ? bucketRailPickers(row, divisions) : null;
  const note = open
    ? BOOK_COPY.revealsAtKickoff
    : game.status === "live"
      ? BOOK_COPY.gradesAtFinal
      : BOOK_COPY.graded;

  return (
    <div
      data-testid="slate-card"
      data-matchup-id={game.matchupId}
      className={`card-surface ${open ? "p-4" : "p-5"}`}
    >
      <div
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 ${
          open ? "mb-2.5" : "mb-3.5"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <StatusKicker game={game} showPush />
          <RivalryKicker game={game} />
        </span>
        <span className="text-[12px] text-text-tertiary">
          <span className="font-mono font-bold tabular-nums text-text-secondary">
            {inCount}
          </span>{" "}
          of{" "}
          <span className="font-mono font-bold tabular-nums text-text-secondary">
            {members.length}
          </span>{" "}
          in · {note}
        </span>
      </div>

      {/* Home side first, then away, matching the Board and PickemsRow.label.
          The same game must not read in two orders on two tabs of one page. */}
      <div className={`flex flex-col ${open ? "gap-2" : "gap-2.5"}`}>
        {(["home", "away"] as const).map((side) => (
          <div key={side}>
            <SideRow
              game={game}
              side={side}
              team={side === "home" ? game.home : game.away}
              picked={pick?.side === side}
              interactive={interactive}
              pending={pending}
              onPick={onPick}
              variant="slate"
            />
            {rail && row && !open && (
              <PickerRail
                buckets={rail[side]}
                total={side === "home" ? rail.homeCount : rail.awayCount}
                divisionCount={divisions.length}
                side={side}
                cells={row.cells}
                viewerSlug={viewerSlug}
                signedIn={signedIn}
              />
            )}
          </div>
        ))}
      </div>

      {pick && (
        <YourPickRow game={game} pick={pick} slipClosed={slipClosed} />
      )}
    </div>
  );
}

/**
 * Who took this side, under the side they took.
 *
 * Rendered only once the game is off the board. The bucketing itself is
 * `bucketRailPickers` (pure, unit-tested): it groups on `cell.side` and never
 * on the abbreviation, because two franchises can carry the same three-letter
 * code (#243) and when both teams of one game collide, bucketing on the code
 * puts every picker on the wrong side.
 */
function PickerRail({
  buckets,
  total,
  divisionCount,
  viewerSlug,
  signedIn,
  side,
  cells,
}: {
  buckets: RailBucket[];
  total: number;
  divisionCount: number;
  viewerSlug: string | null;
  signedIn: boolean;
  side: BookSideKey;
  cells: PickemsRow["cells"];
}) {
  const byDivision = buckets;
  const labelled = divisionCount > 1;

  return (
    <div className="flex flex-col gap-[7px] pt-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-stat text-[15px] leading-none">{total}</span>
        <span className="text-[11px] text-text-tertiary">
          {BOOK_COPY.railTookSide}
        </span>
      </div>

      {byDivision.map((division) => {
        const chips = division.takers.map((picker) => (
          <PickerChip
            key={picker.memberId}
            testId="rail-chip"
            member={picker}
            side={side}
            isViewer={signedIn && picker.franchiseSlug === viewerSlug}
            outcome={cells[String(picker.memberId)]?.outcome ?? null}
          />
        ));

        if (!labelled) {
          return (
            <div key={division.name} className="flex min-w-0 flex-wrap gap-1.5">
              {chips.length > 0 ? chips : <Nobody />}
            </div>
          );
        }

        // A two-column grid, not a flex row with the label as its first item:
        // wrapped chips must stay inside their own column instead of sliding
        // under the label and reading as a third, unlabelled division.
        return (
          <div
            key={division.name}
            className="grid grid-cols-[38px_minmax(0,1fr)] items-start gap-2"
          >
            <span className="pt-1.5 text-[10px] font-semibold uppercase tracking-[.14em] text-text-tertiary">
              {divisionRailLabel(division.name)}
            </span>
            <span className="flex min-w-0 flex-wrap gap-1.5">
              {chips.length > 0 ? chips : <Nobody />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Nobody() {
  return (
    <span className="text-[11px] text-text-tertiary">{BOOK_COPY.railNobody}</span>
  );
}

const CHIP_STATES: Record<
  "ungraded" | PickOutcome,
  { skin: string; code: string; glyph: string | null }
> = {
  ungraded: {
    skin: "border-border bg-white/[.03]",
    code: "text-text-tertiary",
    glyph: null,
  },
  win: {
    skin: "border-accent-green/30 bg-accent-green-light",
    code: "text-accent-green",
    glyph: "✓",
  },
  loss: {
    skin: "border-accent-warm/30 bg-accent-warm-light",
    code: "text-accent-warm",
    glyph: "✗",
  },
  push: {
    skin: "border-border bg-surface-muted",
    code: "text-text-secondary",
    glyph: "PUSH",
  },
};

/**
 * One member on a rail (or in the Week Pulse's ghosting row).
 *
 * Deliberately NOT a link: a 26px tap target would break the phone's 44px
 * floor, and the franchise identities on this tab are clickable in the ledger
 * rows below. The crest is non-decorative for the same reason the old picker
 * column's was: the only visible label here is a three-letter code, so the
 * crest is what makes the chip announce a franchise at all, and it tells two
 * colliding codes apart.
 */
function PickerChip({
  member,
  isViewer,
  outcome,
  side,
  testId,
}: {
  member: PickerColumn;
  isViewer: boolean;
  outcome: PickOutcome | null;
  side?: BookSideKey;
  testId: string;
}) {
  const state = CHIP_STATES[outcome ?? "ungraded"];
  const border = isViewer ? "border-accent-gold/45" : "";
  const code = isViewer ? "text-accent-gold" : state.code;

  return (
    <span
      data-testid={testId}
      data-member-id={member.memberId}
      data-side={side}
      data-outcome={outcome ?? undefined}
      className={`inline-flex items-center gap-[5px] rounded-full border py-[3px] pl-[3px] pr-2 ${state.skin} ${border}`}
    >
      <FranchiseLogo
        slug={member.franchiseSlug}
        name={member.franchiseName}
        abbreviation={member.abbreviation}
        brandingColor={member.color ?? undefined}
        avatarUrl={member.avatarUrl ?? undefined}
        size={20}
      />
      <span
        className={`font-mono text-[10px] font-bold tracking-[.04em] ${code}`}
      >
        {isViewer ? "YOU" : member.abbreviation}
      </span>
      {state.glyph && (
        <span
          className={`text-[10px] font-semibold ${
            outcome === "push" ? "tracking-[.08em] text-text-tertiary" : state.code
          }`}
        >
          {state.glyph}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Season ledger
// ---------------------------------------------------------------------------

// One row shape at both widths. Under `sm` streak and ATS fold onto a second
// line inside the picker cell rather than into two more columns; there is no
// second component and no horizontal scroll.
const LEDGER_GRID =
  "grid grid-cols-[24px_32px_minmax(0,1fr)_72px] items-center gap-3 sm:grid-cols-[28px_36px_minmax(0,1fr)_64px_72px_78px]";

function SeasonLedger({
  rows,
  divisions,
  viewerSlug,
}: {
  rows: AtsLeaderboardRow[];
  divisions: PickemsDivision[];
  viewerSlug: string | null;
}) {
  const anyGraded = rows.some((row) => row.rank !== null);

  return (
    <section>
      <p className="text-kicker mb-3">Season · Against the Spread</p>

      {!anyGraded ? (
        <div className="card-surface p-6">
          <p className="text-body-sm text-text-secondary">
            {BOOK_COPY.ledgerEmpty}
          </p>
        </div>
      ) : (
        <div className="card-surface overflow-hidden p-0">
          {divisions.length > 1 && <DivisionRace divisions={divisions} />}

          <div
            className={`${LEDGER_GRID} border-b border-divider px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[.18em] text-text-tertiary`}
          >
            <span className="text-center">#</span>
            <span />
            <span>Picker</span>
            <span className="hidden sm:block">Streak</span>
            <span className="text-right">Units</span>
            <span className="hidden text-right sm:block">ATS</span>
          </div>

          <ul className="list-none">
            {rows.map((row) => (
              <LedgerRow
                key={row.memberId}
                row={row}
                isYou={row.franchiseSlug === viewerSlug}
              />
            ))}
          </ul>

          <p className="border-t border-divider px-4 py-2.5 text-[11px] text-text-tertiary">
            {BOOK_COPY.unitsNote}
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * The division bragging-rights strip: each division's leader and its combined
 * figures. The figures cover ranked members only, so the strip states its own
 * denominator whenever somebody in the division has nothing graded rather than
 * implying the whole division is in the number.
 */
function DivisionRace({ divisions }: { divisions: PickemsDivision[] }) {
  return (
    <div className="border-b border-divider bg-white/[.03] p-4">
      <p className="text-kicker mb-3 text-accent-gold">
        {BOOK_COPY.divisionRace}
      </p>
      {/* Two up reads best, but this league runs three divisions of four and a
          legacy season can run one, so the column count follows the data. */}
      <div
        className={`grid gap-4 lg:gap-8 ${
          divisions.length >= 3 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2"
        }`}
      >
        {divisions.map((division) => (
          <div key={division.name} className="flex min-w-0 flex-col gap-2">
            <span className="text-kicker">{division.name}</span>
            {division.leader ? (
              <div className="flex min-w-0 items-center gap-2">
                <FranchiseLogo
                  slug={division.leader.franchiseSlug}
                  name={division.leader.franchiseName}
                  abbreviation={division.leader.abbreviation}
                  brandingColor={division.leader.color ?? undefined}
                  avatarUrl={division.leader.avatarUrl ?? undefined}
                  size={20}
                  decorative
                />
                <span className="min-w-0 truncate text-[13px] font-semibold text-text-primary">
                  {division.leader.franchiseName}
                </span>
              </div>
            ) : (
              <span className="text-[13px] text-text-tertiary">
                {BOOK_COPY.noPicksGraded}
              </span>
            )}
            {division.record !== null && division.units !== null && (
              <span className="text-[11px] text-text-tertiary">
                Combined{" "}
                <span className="font-mono font-bold tabular-nums text-text-secondary">
                  {division.record}
                </span>{" "}
                ·{" "}
                <span
                  className={`font-mono font-bold tabular-nums ${
                    division.units >= 0 ? "text-accent-green" : "text-accent-warm"
                  }`}
                >
                  {division.units >= 0 ? "+" : ""}
                  {division.units.toFixed(2)}
                </span>{" "}
                units
                {division.rankedCount < division.memberCount && (
                  <>
                    {" · "}
                    <span className="font-mono tabular-nums">
                      {division.rankedCount}
                    </span>{" "}
                    of{" "}
                    <span className="font-mono tabular-nums">
                      {division.memberCount}
                    </span>{" "}
                    picking
                  </>
                )}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LedgerRow({ row, isYou }: { row: AtsLeaderboardRow; isYou: boolean }) {
  const ranked = row.rank !== null;
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
  const nameColor = !ranked
    ? "text-text-tertiary"
    : row.isLeader
      ? "text-text-primary"
      : row.isLast
        ? "text-accent-warm"
        : "text-text-secondary";
  const streakColor =
    row.streakType === "W" ? "text-accent-green" : "text-accent-warm";
  const positiveUnits = (row.units ?? 0) >= 0;
  const unitsColor = positiveUnits ? "text-accent-green" : "text-accent-warm";

  return (
    <li
      data-testid="ledger-row"
      data-franchise-slug={row.franchiseSlug}
      className={`${LEDGER_GRID} border-t border-divider px-4 py-2.5 ${rowBg}`}
    >
      <span
        className={`text-center font-mono text-body-sm font-bold tabular-nums ${
          ranked ? rankColor : "text-text-muted"
        }`}
      >
        {/* Decorative en dash: the row's own "no picks graded" says the rest. */}
        {ranked ? row.rank : "–"}
      </span>
      {/* ONE link over crest and name, not two to the same place: keyboard and
          screen-reader users get a single stop instead of a duplicate. The
          crest stays decorative and the link carries an explicit name, so the
          record folded under the name at phone width is read as content and
          not as part of the link's label. `contents` lets the anchor hand its
          two children straight to the grid. */}
      <TeamLink
        slug={row.franchiseSlug}
        aria-label={row.franchiseName}
        className="group contents"
      >
        <FranchiseLogo
          slug={row.franchiseSlug}
          name={row.franchiseName}
          abbreviation={row.franchiseAbbreviation ?? undefined}
          brandingColor={row.franchiseColor ?? undefined}
          avatarUrl={row.franchiseAvatarUrl ?? undefined}
          size={28}
          decorative
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className={`min-w-0 truncate text-body-sm transition-colors group-hover:text-accent-gold ${nameWeight} ${nameColor}`}
            >
              {row.franchiseName}
            </span>
            {isYou && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[.1em] text-accent-gold">
                You
              </span>
            )}
            {row.divisionTag && (
              <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[.1em] text-text-tertiary sm:inline">
                {row.divisionTag}
              </span>
            )}
          </span>
          {/* Below `sm` the division tag, the ATS record and the streak ride
              one meta line instead of taking three more columns off a 390px
              row. Above it they are back in their own columns. */}
          <span className="flex items-baseline gap-2.5 text-[11px] sm:hidden">
            {row.divisionTag && (
              <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-text-tertiary">
                {row.divisionTag}
              </span>
            )}
            {ranked && (
              <>
                <span className="font-mono font-bold tabular-nums text-text-tertiary">
                  {row.record}
                </span>
                {row.streakLabel && (
                  <span
                    className={`font-mono font-semibold tabular-nums ${streakColor}`}
                  >
                    {row.streakLabel}
                  </span>
                )}
              </>
            )}
          </span>
        </span>
      </TeamLink>

      {ranked ? (
        <>
          <span
            className={`hidden font-mono text-body-sm font-semibold tabular-nums sm:block ${streakColor}`}
          >
            {/* En dash, decorative: a ranked member whose graded picks are all
                pushes has no streak to name. */}
            {row.streakLabel ?? "–"}
          </span>
          <span
            className={`text-right font-mono text-body-sm font-semibold tabular-nums ${unitsColor}`}
          >
            {positiveUnits ? "+" : ""}
            {(row.units ?? 0).toFixed(2)}
          </span>
          <span
            className={`hidden text-right font-mono text-body-sm font-bold tabular-nums sm:block ${
              row.isLeader ? "text-text-primary" : "text-text-tertiary"
            }`}
          >
            {row.record}
          </span>
        </>
      ) : (
        // No record, no units, no streak: a member with nothing graded has
        // nothing to show, and inventing a 0-0 would be a fabricated claim.
        <span
          style={{ gridColumn: "4 / -1" }}
          className="text-right text-[11px] text-text-tertiary"
        >
          {BOOK_COPY.noPicksGraded}
        </span>
      )}
    </li>
  );
}
