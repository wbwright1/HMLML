"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSessionMember } from "@/components/use-session-member";
import { togglePropPick } from "@/app/actions/book";
import {
  BOOK_COPY,
  type BookPropView,
  type MemberPropPick,
  type PropSide,
} from "@/lib/book/shared";

/**
 * The Props tab: 3 weekly props plus the House Rules card as the grid's 4th
 * cell (matching the design's 2x2 layout).
 *
 * A client island (enumerated in CLAUDE.md) for the same reason the board
 * island is one: /book is ISR-cached HTML served to the whole league, so the
 * member's own prop picks cannot live in the server tree. The session
 * resolves through the shared /api/session hook and the member's own picks
 * come from /api/book/prop-picks after mount. Everything the island lets you
 * do is re-enforced by the server action; nothing here is a permission check.
 *
 * Signed out, the tab is fully readable and completely inert: lines, odds,
 * and snark all render, there is just nothing to press.
 */
export function PropsIsland({
  props,
  week,
}: {
  props: BookPropView[];
  week: number;
}) {
  const session = useSessionMember();
  const router = useRouter();
  const [picks, setPicks] = useState<Map<number, MemberPropPick>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [pendingPropId, setPendingPropId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const signedIn = session.status === "ready" && session.member !== null;

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    fetch("/api/book/prop-picks", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body: {
            data?: { picks: MemberPropPick[]; week: number | null };
          } | null,
        ) => {
          if (!active) return;
          // Discards a payload for any week other than this tab's, same
          // reasoning as the board island's picksForBoardWeek check.
          if (!body?.data || body.data.week !== week) return;
          setPicks(new Map(body.data.picks.map((p) => [p.propId, p])));
        },
      )
      .catch(() => {
        // An unreachable slip is a read-only tab, not a broken page.
      });
    return () => {
      active = false;
    };
  }, [signedIn, week]);

  function onPick(prop: BookPropView, side: PropSide) {
    if (!signedIn || prop.result !== null) return;
    setError(null);
    setPendingPropId(prop.id);

    const previous = picks.get(prop.id) ?? null;
    const next = new Map(picks);
    if (previous?.side === side) next.delete(prop.id);
    else
      next.set(prop.id, {
        propId: prop.id,
        side,
        oddsAtPick:
          side === "over"
            ? Number(prop.overOdds.replace("+", ""))
            : Number(prop.underOdds.replace("+", "")),
        lockedAt: null,
      });
    setPicks(next);

    startTransition(async () => {
      const result = await togglePropPick({ week, propId: prop.id, side });
      setPendingPropId(null);
      if (!result.ok) {
        setError(result.error);
        setPicks((current) => {
          const restored = new Map(current);
          if (previous) restored.set(prop.id, previous);
          else restored.delete(prop.id);
          return restored;
        });
        return;
      }
      router.refresh();
    });
  }

  if (props.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="card-surface p-6">
          <p className="text-kicker mb-2">Props</p>
          <p className="font-serif text-h3 italic text-text-secondary">
            {BOOK_COPY.propsSoon}
          </p>
        </div>
        <HouseRulesCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="status" className="card-surface p-3 text-body-sm text-accent-warm">
          {error}
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {props.map((prop) => (
          <PropCard
            key={prop.id}
            prop={prop}
            pick={picks.get(prop.id) ?? null}
            signedIn={signedIn}
            pending={pendingPropId === prop.id}
            onPick={onPick}
          />
        ))}
        <HouseRulesCard />
      </div>
    </div>
  );
}

function PropCard({
  prop,
  pick,
  signedIn,
  pending,
  onPick,
}: {
  prop: BookPropView;
  pick: MemberPropPick | null;
  signedIn: boolean;
  pending: boolean;
  onPick: (prop: BookPropView, side: PropSide) => void;
}) {
  const graded = prop.result !== null;
  const interactive = signedIn && !graded;

  return (
    <div className="card-surface p-5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="text-kicker">{prop.label}</p>
        {graded ? (
          <ResultBadge prop={prop} pick={pick} />
        ) : pick ? (
          <span className="text-caption font-semibold text-text-tertiary">
            Pending
          </span>
        ) : null}
      </div>
      <p className="mb-0.5 text-body-sm font-semibold text-text-primary">
        {prop.question}
      </p>
      <p className="mb-3.5 font-mono text-[24px] font-bold tabular-nums text-accent-gold">
        {prop.lineDisplay}
      </p>

      <div className="flex gap-2">
        <PropSideButton
          label={prop.overLabel}
          odds={prop.overOdds}
          payout={prop.overPayout}
          picked={pick?.side === "over"}
          resultSide={prop.result === "over"}
          graded={graded}
          interactive={interactive}
          pending={pending}
          onClick={() => onPick(prop, "over")}
        />
        <PropSideButton
          label={prop.underLabel}
          odds={prop.underOdds}
          payout={prop.underPayout}
          picked={pick?.side === "under"}
          resultSide={prop.result === "under"}
          graded={graded}
          interactive={interactive}
          pending={pending}
          onClick={() => onPick(prop, "under")}
        />
      </div>

      {prop.snark && (
        <p className="mt-3 font-serif text-body-sm italic text-text-tertiary">
          {prop.snark}
        </p>
      )}
    </div>
  );
}

function PropSideButton({
  label,
  odds,
  payout,
  picked,
  resultSide,
  graded,
  interactive,
  pending,
  onClick,
}: {
  label: string;
  odds: string;
  payout: string;
  picked: boolean;
  resultSide: boolean;
  graded: boolean;
  interactive: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const base =
    "flex-1 rounded-[11px] border p-2.5 text-center transition-colors duration-150";
  const skin = picked
    ? "border-accent-gold/45 bg-accent-gold-light"
    : "border-border bg-white/[.03]";
  // Once graded, dim the side that did not hit; never dim by color alone
  // (the checkmark below carries the same signal in text/glyph form).
  const dim = graded && !resultSide ? "opacity-55" : "";

  const content = (
    <>
      <span className="block text-body-sm font-semibold text-text-primary">
        {label}
        {graded && resultSide && (
          <span className="ml-1.5 text-accent-green" aria-hidden="true">
            ✓
          </span>
        )}
      </span>
      <span className="mt-0.5 block font-mono text-caption font-semibold normal-case tracking-normal tabular-nums text-text-tertiary">
        {odds}
      </span>
      <span className="mt-0.5 block text-[11px] text-text-muted">{payout}</span>
    </>
  );

  if (!interactive) {
    return <div className={`${base} ${skin} ${dim}`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={picked}
      aria-label={`Pick ${label}`}
      className={`${base} ${skin} cursor-pointer hover:border-border-strong disabled:cursor-wait`}
    >
      {content}
    </button>
  );
}

function ResultBadge({
  prop,
  pick,
}: {
  prop: BookPropView;
  pick: MemberPropPick | null;
}) {
  if (!pick) {
    return <span className="text-caption font-semibold text-text-tertiary">Graded</span>;
  }
  const hit = pick.side === prop.result;
  return (
    <span
      className={`text-caption font-semibold ${
        hit ? "text-accent-green" : "text-accent-warm"
      }`}
    >
      {hit ? "Hit ✓" : "Missed ✗"}
    </span>
  );
}

function HouseRulesCard() {
  return (
    <div className="rounded-[14px] border border-dashed border-border-strong p-6">
      <p className="text-kicker mb-1.5">House Rules</p>
      <p className="text-body-sm leading-relaxed text-text-secondary">
        {BOOK_COPY.houseRules}
      </p>
    </div>
  );
}
