"use client";

import { useEffect, useState } from "react";
import { useSessionMember } from "@/components/use-session-member";
import { picksForBoardWeek } from "@/lib/book/shared";
import type {
  AtsLeaderboardRow,
  MemberBookPick,
  WhoPickedWhomData,
} from "@/lib/book/shared";

/**
 * The Book's Tracking tab: season ATS leaderboard + Who Picked Whom grid.
 *
 * A client island (enumerated in CLAUDE.md) for the same reason the board
 * island is: /book is ISR-cached HTML served to the whole league, so the
 * viewer's own identity ("YOU" tag) and their own not-yet-kicked-off picks
 * cannot be part of the cached server tree. The server queries already strip
 * every OTHER member's open-game picks before this component ever sees them
 * (the anti-tailing rule); this island only ever adds the viewer's own.
 *
 * Streak Watch is not part of this island: it carries no session-dependent
 * state, so it renders as a plain server component alongside this one.
 */
export function TrackingIsland({
  leaderboard,
  grid,
  week,
}: {
  leaderboard: AtsLeaderboardRow[];
  grid: WhoPickedWhomData;
  week: number;
}) {
  const session = useSessionMember();
  const franchiseSlug =
    session.status === "ready" ? session.member?.franchiseSlug ?? null : null;

  const [ownPicks, setOwnPicks] = useState<Map<number, MemberBookPick>>(
    new Map(),
  );

  useEffect(() => {
    if (!franchiseSlug) return;
    let active = true;
    fetch("/api/book/picks", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body: {
            data?: { picks: MemberBookPick[]; week: number | null };
          } | null,
        ) => {
          if (!active) return;
          const mine = picksForBoardWeek(body?.data, week);
          if (!mine) return;
          setOwnPicks(new Map(mine.map((p) => [p.matchupId, p])));
        },
      )
      .catch(() => {
        // A missed overlay just leaves the viewer's own open picks blank,
        // same as anyone else's; never a broken page.
      });
    return () => {
      active = false;
    };
  }, [franchiseSlug, week]);

  return (
    <div className="flex flex-col gap-4">
      <AtsLeaderboard rows={leaderboard} viewerSlug={franchiseSlug} />
      <WhoPickedWhomGrid
        data={grid}
        week={week}
        viewerSlug={franchiseSlug}
        ownPicks={ownPicks}
      />
    </div>
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
      <span
        className="flex size-7 items-center justify-center rounded-[8px]"
        style={{ backgroundColor: row.franchiseColor ?? "#6E6759" }}
        aria-hidden="true"
      >
        <span className="text-[10px] font-bold text-canvas">
          {row.franchiseAbbreviation ?? row.franchiseName.slice(0, 2).toUpperCase()}
        </span>
      </span>
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
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-[8px]"
        style={{ backgroundColor: row.franchiseColor ?? "#6E6759" }}
        aria-hidden="true"
      >
        <span className="text-[10px] font-bold text-canvas">
          {row.franchiseAbbreviation ?? row.franchiseName.slice(0, 2).toUpperCase()}
        </span>
      </span>
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
// Who Picked Whom grid
// ---------------------------------------------------------------------------

function WhoPickedWhomGrid({
  data,
  week,
  viewerSlug,
  ownPicks,
}: {
  data: WhoPickedWhomData;
  week: number;
  viewerSlug: string | null;
  ownPicks: Map<number, MemberBookPick>;
}) {
  if (data.header.length === 0) {
    return null;
  }

  return (
    <section>
      <p className="text-kicker mb-3">
        Week <span className="font-mono tabular-nums">{week}</span> · Who
        Picked Whom
      </p>
      {/* Deep-dive exception to the mobile cards-over-tables rule (matching
          the records-page precedent in components/franchise-h2h-grid.tsx's
          sibling tables): this is a wide matrix, not a list, so it scrolls in
          its own container on narrow viewports rather than reflowing to
          per-picker cards. */}
      <div className="card-surface overflow-x-auto p-0">
        <div
          className="grid items-center gap-2 border-b border-divider px-4 py-2.5"
          style={{
            gridTemplateColumns: `minmax(140px,1fr) repeat(${data.header.length}, 60px)`,
            minWidth: `${140 + data.header.length * 68}px`,
          }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-[.18em] text-text-muted">
            Picker
          </span>
          {data.header.map((h) => (
            <span
              key={h.matchupId}
              className="text-center font-mono text-[10px] font-semibold text-text-muted"
            >
              {h.label}
            </span>
          ))}
        </div>
        <ul className="list-none">
          {data.rows.map((row) => (
            <GridRow
              key={row.memberId}
              row={row}
              header={data.header}
              isYou={row.franchiseSlug === viewerSlug}
              ownPicks={ownPicks}
            />
          ))}
        </ul>
        <p className="border-t border-divider px-4 py-2.5 text-[11px] text-text-tertiary">
          ✓ covering or hit · ✗ behind or missed · — locks later. Live games
          show the current cover. You can always see your own picks; nobody
          else's open picks show before kickoff.
        </p>
      </div>
    </section>
  );
}

function GridRow({
  row,
  header,
  isYou,
  ownPicks,
}: {
  row: WhoPickedWhomData["rows"][number];
  header: WhoPickedWhomData["header"];
  isYou: boolean;
  ownPicks: Map<number, MemberBookPick>;
}) {
  return (
    <li
      className={`grid items-center gap-2 border-t border-divider px-4 py-2 ${
        isYou ? "bg-white/[.03]" : ""
      }`}
      style={{
        gridTemplateColumns: `minmax(140px,1fr) repeat(${header.length}, 60px)`,
        minWidth: `${140 + header.length * 68}px`,
      }}
    >
      <span
        className={`min-w-0 truncate text-body-sm ${
          isYou ? "font-semibold text-text-primary" : "text-text-secondary"
        }`}
      >
        {row.displayName}
        {isYou && (
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-[.1em] text-accent-gold">
            You
          </span>
        )}
      </span>
      {row.cells.map((cell, i) => {
        const matchupId = header[i]?.matchupId;
        const overlay =
          isYou && !cell.revealed && matchupId != null
            ? ownPicks.get(matchupId)
            : null;
        const abbreviation =
          cell.abbreviation ??
          (overlay
            ? overlay.side === "home"
              ? header[i]?.homeAbbreviation
              : header[i]?.awayAbbreviation
            : null);

        if (!abbreviation) {
          return (
            <span
              key={matchupId ?? i}
              className="text-center font-mono text-[11px] font-semibold text-text-muted"
            >
              —
            </span>
          );
        }

        let tone = "bg-transparent text-text-tertiary";
        let glyph = "";
        if (cell.outcome === "win") {
          tone = "bg-accent-green-light text-accent-green";
          glyph = " ✓";
        } else if (cell.outcome === "loss") {
          tone = "bg-accent-warm-light text-accent-warm";
          glyph = " ✗";
        }

        return (
          <span
            key={matchupId ?? i}
            className={`rounded-[6px] py-0.5 text-center font-mono text-[11px] font-semibold ${tone}`}
          >
            {abbreviation}
            {glyph}
          </span>
        );
      })}
    </li>
  );
}
