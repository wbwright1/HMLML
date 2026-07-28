import Link from "next/link";
import {
  ClipboardList,
  ArrowLeftRight,
  UserPlus,
  UserMinus,
  Trophy,
  Users,
} from "lucide-react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { getAwardMeta } from "@/lib/awards";
import type { TimelineEvent } from "@/lib/queries/player-profile";

interface CareerTimelineProps {
  /** Newest-first, as returned by getPlayerTimeline — reversed internally for chronological display. */
  timeline: TimelineEvent[];
}

function eventIcon(type: TimelineEvent["type"]) {
  switch (type) {
    case "drafted":
      return ClipboardList;
    case "trade_in":
    case "trade_out":
      return ArrowLeftRight;
    case "waiver_add":
      return UserPlus;
    case "drop":
      return UserMinus;
    case "award":
      return Trophy;
    case "stint":
      return Users;
  }
}

function eventDate(event: TimelineEvent): string {
  if (event.sleeperMs) {
    return new Date(event.sleeperMs).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return String(event.seasonYear);
}

function eventCopy(event: TimelineEvent): React.ReactNode {
  const franchiseName = event.franchise?.name ?? "an unknown team";
  switch (event.type) {
    case "drafted":
      return (
        <>
          Drafted{" "}
          {event.draftRound != null && event.draftPickNumber != null
            ? `Round ${event.draftRound}, Pick ${event.draftPickNumber}`
            : ""}{" "}
          by {franchiseName}.
        </>
      );
    case "trade_in":
      return (
        <>
          Acquired by {franchiseName} via trade
          {event.tradeDbId != null && (
            <>
              {" "}
              (
              <Link
                href={`/trades#trade-${event.tradeDbId}`}
                className="text-accent-gold hover:underline"
              >
                see the deal
              </Link>
              )
            </>
          )}
          .
        </>
      );
    case "trade_out":
      return (
        <>
          Traded away from {franchiseName}
          {event.tradeDbId != null && (
            <>
              {" "}
              (
              <Link
                href={`/trades#trade-${event.tradeDbId}`}
                className="text-accent-gold hover:underline"
              >
                see the deal
              </Link>
              )
            </>
          )}
          .
        </>
      );
    case "waiver_add":
      return <>Picked up off waivers by {franchiseName}.</>;
    case "drop":
      return <>Dropped by {franchiseName}. Somebody panicked.</>;
    case "award": {
      const meta = event.awardType ? getAwardMeta(event.awardType) : null;
      return (
        <>
          Won {meta?.label ?? event.awardType}
          {event.awardNote ? ` — ${event.awardNote}` : ""}.
        </>
      );
    }
    case "stint":
      return (
        <>
          Rostered by {franchiseName}
          {event.stintEndSeasonYear != null &&
          event.stintEndSeasonYear !== event.seasonYear
            ? ` through ${event.stintEndSeasonYear}`
            : ""}
          .
        </>
      );
  }
}

/** Vertical career timeline, chronological (oldest first). Empty timeline renders nothing. */
export function CareerTimeline({ timeline }: CareerTimelineProps) {
  if (timeline.length === 0) return null;
  const chronological = [...timeline].reverse();

  return (
    <div className="space-y-4">
      <p className="text-kicker text-text-tertiary">Career Timeline</p>
      <ol className="space-y-3">
        {chronological.map((event, i) => {
          const Icon = eventIcon(event.type);
          const isAward = event.type === "award";
          return (
            <li
              key={i}
              className={`flex gap-3 rounded-[10px] border border-border p-3 ${
                isAward ? "card-tint-gold bg-surface" : "bg-surface"
              }`}
            >
              <div
                className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                  isAward
                    ? "bg-accent-gold-light text-accent-gold"
                    : "bg-surface-muted text-text-tertiary"
                }`}
              >
                <Icon className="size-4" strokeWidth={1.7} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-caption tabular-nums text-text-tertiary">
                    {eventDate(event)}
                  </span>
                  {event.franchise && (
                    <FranchiseLogo
                      slug={event.franchise.slug}
                      name={event.franchise.name}
                      size={18}
                      decorative
                    />
                  )}
                </div>
                <p className="font-serif italic text-body-sm text-text-secondary">
                  {eventCopy(event)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
