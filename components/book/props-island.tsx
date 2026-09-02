"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSessionMember } from "@/components/use-session-member";
import { togglePropPick } from "@/app/actions/book";
import { FranchiseLogo } from "@/components/franchise-logo";
import { BookEntityLink } from "@/components/book/entity-link";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PROP_GROUP_ORDER } from "@/lib/book/props";
import {
  BOOK_COPY,
  DEFAULT_STAKE,
  type BookPropEntity,
  type BookPropView,
  type MemberPropPick,
  type PropSide,
} from "@/lib/book/shared";

/**
 * The Props tab: the week's full slate, in sections.
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
  // Set the instant a pick happens, so a mount fetch still in flight (or
  // simply slower than the click, the common case: the GET and the server
  // action race with no guarantee the GET wins) cannot land afterward and
  // clobber state a real user action already produced. Without this, a
  // click's optimistic set gets overwritten by the initial fetch resolving
  // late, leaving the UI showing "unpicked" for a pick that is actually
  // booked in Postgres (same race the board island has for /api/book/picks).
  const mutatedRef = useRef(false);

  const signedIn = session.status === "ready" && session.member !== null;

  // Only picks on props that have NOT settled are still at risk: once a prop
  // grades, the money is decided, and calling it "at risk" for the rest of the
  // week would be a false claim about the member's slip.
  const atRisk = useMemo(() => {
    const ungraded = new Set(
      props.filter((p) => p.result === null).map((p) => p.id),
    );
    let count = 0;
    for (const propId of picks.keys()) if (ungraded.has(propId)) count++;
    return count;
  }, [props, picks]);

  // Section order comes from the kind registry in lib, never a second list
  // here: a group this file forgot to name would drop its cards off the tab
  // while the slip strip above still counted them.
  const sections = useMemo(() => {
    return PROP_GROUP_ORDER.map((group) => ({
      group,
      label: BOOK_COPY.propGroupLabels[group],
      items: props.filter((p) => p.group === group),
    })).filter((section) => section.items.length > 0);
  }, [props]);

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    mutatedRef.current = false;
    fetch("/api/book/prop-picks", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          body: {
            data?: { picks: MemberPropPick[]; week: number | null };
          } | null,
        ) => {
          if (!active || mutatedRef.current) return;
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
    mutatedRef.current = true;

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
      <div className="flex flex-col gap-4">
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
    <div className="flex flex-col gap-8">
      {error && (
        <p role="status" className="card-surface p-3 text-body-sm text-accent-warm">
          {error}
        </p>
      )}

      <SlipStrip total={props.length} atRisk={atRisk} picked={picks.size} signedIn={signedIn} />

      {sections.map((section) => (
        <section key={section.group} className="flex flex-col gap-4">
          <div className="flex items-baseline gap-2">
            <h3 className="text-kicker">{section.label}</h3>
            <span className="font-mono text-caption font-semibold tabular-nums text-text-muted">
              {section.items.length}
            </span>
          </div>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {section.items.map((prop) => (
              <PropCard
                key={prop.id}
                prop={prop}
                pick={picks.get(prop.id) ?? null}
                signedIn={signedIn}
                pending={pendingPropId === prop.id}
                onPick={onPick}
              />
            ))}
          </div>
        </section>
      ))}

      <HouseRulesCard />
    </div>
  );
}

/**
 * "3 of 11 props picked · $30 at risk", in the Board's language. Derived
 * entirely from state the island already holds, so it costs nothing.
 */
function SlipStrip({
  total,
  picked,
  atRisk,
  signedIn,
}: {
  total: number;
  picked: number;
  /** Picks on props that have not graded yet. Settled is settled. */
  atRisk: number;
  signedIn: boolean;
}) {
  if (!signedIn) {
    return (
      <p className="text-body-sm text-text-tertiary">
        {BOOK_COPY.signedOut}{" "}
        <span className="font-mono tabular-nums">{total}</span> props on the board.
      </p>
    );
  }

  return (
    <p className="text-body-sm text-text-tertiary">
      <span className="font-mono font-semibold tabular-nums text-text-primary">
        {picked}
      </span>{" "}
      of{" "}
      <span className="font-mono font-semibold tabular-nums text-text-primary">
        {total}
      </span>{" "}
      props picked
      {picked === 0 && (
        <>
          {" · "}
          {BOOK_COPY.propSlipEmpty}
        </>
      )}
      {atRisk > 0 && (
        <>
          {" · "}
          <span className="font-mono font-semibold tabular-nums text-accent-gold">
            ${atRisk * DEFAULT_STAKE}
          </span>{" "}
          at risk
        </>
      )}
    </p>
  );
}

/**
 * One prop card. The marquee variant (the League Total: the one prop about the
 * whole league at once, and the screenshot the tab exists for) is the same
 * component at a bigger size, so the two can never drift apart. Which variant
 * a kind gets is decided in lib, not by matching on a kind name here.
 */
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
  const marquee = prop.display === "marquee";

  return (
    <div
      data-testid="prop-card"
      data-prop-kind={prop.kind}
      data-prop-graded={graded ? "true" : "false"}
      className={
        marquee
          ? "card-surface card-glows relative overflow-hidden p-6 md:col-span-2"
          : "card-surface p-5"
      }
    >
      <div
        className={`flex items-center justify-between gap-3 ${marquee ? "mb-2" : "mb-2.5"}`}
      >
        <p className="text-kicker">{prop.label}</p>
        <ResultBadge prop={prop} pick={pick} />
      </div>

      <SubjectIdentity prop={prop} />

      <p
        className={`font-semibold text-text-primary ${
          marquee ? "mb-1 text-body" : "mb-0.5 text-body-sm"
        }`}
      >
        {prop.question}
      </p>
      <p
        className={`flex items-baseline ${marquee ? "mb-4 gap-2" : "mb-3.5 gap-1.5"}`}
      >
        <span
          className={`font-mono leading-none font-bold tabular-nums text-accent-gold ${
            marquee ? "text-[40px]" : "text-[28px]"
          }`}
        >
          {prop.lineDisplay}
        </span>
        {prop.lineUnit && (
          <span className="text-caption text-text-tertiary">{prop.lineUnit}</span>
        )}
      </p>

      <PropSides
        prop={prop}
        pick={pick}
        signedIn={signedIn}
        pending={pending}
        onPick={onPick}
      />
      <GradedLine prop={prop} />

      {prop.subjectMissing && (
        <p className="mt-3 text-body-sm text-text-tertiary">
          {BOOK_COPY.propSubjectMissing}
        </p>
      )}

      {prop.snark && (
        <p
          className={`mt-3 font-serif italic text-text-tertiary ${
            marquee ? "text-body" : "text-body-sm"
          }`}
        >
          {prop.snark}
        </p>
      )}

      {graded && <span className="sr-only">This prop has been graded.</span>}
    </div>
  );
}

/** The face or crest the prop is about. Nothing renders for league-wide props. */
function SubjectIdentity({ prop }: { prop: BookPropView }) {
  const subject = prop.subject;
  if (!subject) return null;

  if (subject.kind === "pair") {
    return (
      <div className="mb-3 flex items-center gap-2">
        <EntityChip entity={subject.a} />
        <span className="font-mono text-caption font-bold text-text-muted">VS</span>
        <EntityChip entity={subject.b} />
      </div>
    );
  }

  return (
    <div className="mb-3">
      <EntityChip entity={subject} />
    </div>
  );
}

function EntityChip({ entity }: { entity: BookPropEntity }) {
  if (entity.kind === "player") {
    return (
      <BookEntityLink
        target={{ kind: "player", playerId: entity.playerId }}
        className="flex min-w-0 items-center gap-2 text-text-primary"
      >
        <PlayerHeadshot
          playerId={entity.playerId}
          name={entity.name}
          size={32}
          nflTeam={entity.nflTeam}
        />
        <span className="min-w-0">
          <span className="block truncate text-body-sm font-semibold">
            {entity.name}
          </span>
          <span className="text-kicker">
            {[entity.position, entity.nflTeam].filter(Boolean).join(" · ")}
          </span>
        </span>
      </BookEntityLink>
    );
  }

  return (
    <BookEntityLink
      target={{ kind: "franchise", slug: entity.slug, name: entity.name }}
      labelled={false}
      className="flex min-w-0 items-center gap-2 text-text-primary"
    >
      <FranchiseLogo
        slug={entity.slug}
        name={entity.name}
        abbreviation={entity.abbreviation ?? undefined}
        brandingColor={entity.brandingColor ?? undefined}
        avatarUrl={entity.avatarUrl ?? undefined}
        size="sm"
        decorative
      />
      <span className="min-w-0">
        {/* No abbreviation kicker under the name: the crest above it is the
            franchise's identity now, and reprinting its letter code beneath
            the full name only repeats what the crest already says. */}
        <span className="block truncate text-body-sm font-semibold">
          {entity.name}
        </span>
      </span>
    </BookEntityLink>
  );
}

function PropSides({
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
  // A card whose subject cannot be named is readable but closed: booking a
  // pick on a question with no subject would leave a bet nobody can settle or
  // even describe later.
  const interactive = signedIn && !graded && !prop.subjectMissing;

  return (
    <div className="flex gap-2">
      <PropSideButton
        label={prop.overLabel}
        odds={prop.overOdds}
        payout={prop.overPayout}
        picked={pick?.side === "over"}
        resultSide={prop.result === "over"}
        graded={graded}
        pushed={prop.result === "push"}
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
        pushed={prop.result === "push"}
        interactive={interactive}
        pending={pending}
        onClick={() => onPick(prop, "under")}
      />
    </div>
  );
}

/** "Landed 1,204.7". Stored since the first prop shipped, shown since #239. */
function GradedLine({ prop }: { prop: BookPropView }) {
  if (!prop.actualDisplay) return null;
  return (
    <p
      data-testid="prop-actual"
      className="mt-3 font-mono text-body-sm font-semibold tabular-nums text-text-secondary"
    >
      {prop.actualDisplay}
    </p>
  );
}

function PropSideButton({
  label,
  odds,
  payout,
  picked,
  resultSide,
  graded,
  pushed,
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
  pushed: boolean;
  interactive: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  const base =
    "flex-1 rounded-[11px] border p-2.5 text-center transition-colors duration-150";
  const skin = picked
    ? "border-accent-gold/45 bg-accent-gold-light"
    : "border-border bg-white/[.03]";
  // Once graded, dim the side that did not hit. Never the only signal: the
  // winning side carries a checkmark with an sr-only equivalent, and a push
  // dims neither side because neither one won.
  const dim = graded && !pushed && !resultSide ? "opacity-55" : "";

  const content = (
    <>
      <span className="block text-body-sm font-semibold text-text-primary">
        {label}
        {graded && resultSide && (
          <>
            <span className="ml-1.5 text-accent-green" aria-hidden="true">
              ✓
            </span>
            <span className="sr-only"> (winning side)</span>
          </>
        )}
      </span>
      <span className="mt-0.5 block font-mono text-caption font-semibold normal-case tracking-normal tabular-nums text-text-tertiary">
        {odds}
      </span>
      <span className="mt-0.5 block text-[11px] leading-tight text-text-muted">{payout}</span>
      {/* The picked state must survive greyscale, so it says so in words
          rather than relying on the gold border and tint alone. */}
      {picked && (
        <span className="text-kicker mt-1 block text-accent-gold">Picked</span>
      )}
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
  if (prop.result === null) {
    return pick ? (
      <span className="text-caption font-semibold text-text-tertiary">Pending</span>
    ) : null;
  }

  if (prop.result === "push") {
    // Rust and green both mean "somebody won". A push is neither, so it takes
    // the neutral token and an = glyph, never a colour on its own.
    return (
      <span className="text-caption font-semibold text-text-tertiary">Push =</span>
    );
  }

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
