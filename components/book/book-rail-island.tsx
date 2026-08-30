"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSessionMember } from "@/components/use-session-member";
import { gradePick } from "@/lib/book/pricing";
import { formatRecord } from "@/lib/format-record";
import { picksForBoardWeek, type BookGame, type MemberBookPick } from "@/lib/book/shared";

/**
 * The gold Book rail card's live member-record half.
 *
 * A client island (enumerated in CLAUDE.md, same reason as the board island):
 * `/` is ISR-cached HTML served to the whole league, so a member's own slip
 * record cannot be part of the server tree. Signed out, or before the picks
 * fetch resolves, the server-computed league-wide fallback line renders
 * instead; it is never replaced by a fabricated "0-0".
 */
export function BookRailIsland({
  week,
  games,
  fallbackLine,
}: {
  week: number;
  games: BookGame[];
  fallbackLine: string;
}) {
  const session = useSessionMember();
  const [picks, setPicks] = useState<MemberBookPick[] | null>(null);
  const signedIn = session.status === "ready" && session.member !== null;

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    fetch("/api/book/picks", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data?: { picks: MemberBookPick[]; week: number | null } } | null) => {
        if (!active) return;
        const mine = picksForBoardWeek(body?.data, week);
        if (mine) setPicks(mine);
      })
      .catch(() => {
        // An unreachable slip falls back to the league-wide line, not an error.
      });
    return () => {
      active = false;
    };
  }, [signedIn, week]);

  const gamesById = new Map(games.map((g) => [g.matchupId, g]));

  let recordLine: string | null = null;
  let summaryLine = fallbackLine;

  if (signedIn && picks) {
    let hits = 0;
    let misses = 0;
    let pushes = 0;
    let graded = 0;

    for (const pick of picks) {
      const game = gamesById.get(pick.matchupId);
      if (!game || game.status === "open") continue;
      graded += 1;
      const result = gradePick(game.home.points, game.away.points, pick);
      if (result === "push") pushes += 1;
      else if (result === pick.side) hits += 1;
      else misses += 1;
    }

    const openCount = games.filter((g) => g.status === "open").length;

    if (graded > 0) {
      recordLine = formatRecord(hits, misses, pushes);
      summaryLine =
        openCount > 0
          ? `Covering on ${hits} of ${graded} locked picks. ${openCount} game${openCount === 1 ? "" : "s"} still open.`
          : `Covering on ${hits} of ${graded} locked picks.`;
    } else if (picks.length > 0) {
      // Nothing graded yet: an honest "picked" count, not a fabricated 0-0.
      summaryLine = `${picks.length} of ${games.length} games picked.`;
    } else {
      summaryLine = "No picks in yet this week.";
    }
  }

  return (
    <section className="space-y-3">
      <p className="text-kicker text-accent-gold">
        The Book &middot; Week <span className="font-mono tabular-nums">{week}</span>
      </p>
      <div className="card-surface relative overflow-hidden p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(226,184,88,0.10), rgba(226,184,88,0.02))",
          }}
        />
        <div className="relative">
          {recordLine && (
            <p className="text-stat tabular-nums text-[30px] leading-none text-text-primary">
              {recordLine}
            </p>
          )}
          <p className={recordLine ? "mt-3 text-body-sm text-text-secondary" : "text-body-sm text-text-secondary"}>
            {summaryLine}
          </p>
          <Link
            href="/book"
            className="mt-4 inline-block rounded-full bg-accent-gold px-4 py-2 text-body-sm font-semibold text-canvas transition-[filter] duration-150 hover:brightness-110"
          >
            Open the board &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
