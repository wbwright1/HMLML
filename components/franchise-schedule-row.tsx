import Link from "next/link";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { LiveIndicator } from "@/components/live-indicator";
import type { FranchiseScheduleWeek } from "@/lib/queries/schedule";

interface FranchiseScheduleRowProps {
  week: FranchiseScheduleWeek;
  seasonYear: number;
}

export function ResultBadge({ result }: { result: "W" | "L" | "T" }) {
  const isWin = result === "W";
  const isTie = result === "T";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-mono text-xs font-bold tabular-nums size-6 shrink-0 ${
        isTie
          ? "bg-surface-muted text-text-tertiary"
          : isWin
            ? "bg-accent-green-light text-accent-green"
            : "bg-accent-warm-light text-accent-warm"
      }`}
      aria-label={isWin ? "Win" : isTie ? "Tie" : "Loss"}
    >
      {result}
    </span>
  );
}

/** One row of a franchise's per-week schedule: opponent, plus a result badge
 * (W/L/T) for completed weeks, a LiveIndicator for in-progress weeks, or an
 * "Upcoming" label for scheduled-but-not-played weeks. Links to matchup detail. */
export function FranchiseScheduleRow({
  week,
  seasonYear,
}: FranchiseScheduleRowProps) {
  const { opponent } = week;

  const content = (
    <div className="flex items-center gap-4 rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      {/* Mobile: compact "W3" / "P1" chip */}
      <span className="sm:hidden font-mono tabular-nums text-body-sm font-semibold text-text-primary shrink-0">
        {week.isPlayoff ? "P" : "W"}
        {week.week}
      </span>

      {/* Desktop: full label + separate number */}
      <div className="hidden sm:flex items-center gap-2 shrink-0 w-16">
        <span className="text-kicker">
          {week.isPlayoff ? "Playoff" : "Week"}
        </span>
      </div>
      <span className="hidden sm:inline font-mono tabular-nums text-body-sm font-semibold text-text-primary shrink-0 w-6">
        {week.week}
      </span>

      <div className="flex-1 min-w-0">
        {opponent ? (
          <FranchiseIdentity
            franchise={{
              slug: opponent.franchiseSlug,
              name: opponent.franchiseName,
              abbreviation: opponent.franchiseAbbreviation ?? undefined,
              brandingColor: opponent.franchiseBrandingColor ?? undefined,
              avatarUrl: opponent.avatarUrl,
            }}
            variant="compact"
          />
        ) : (
          <span className="text-body-sm text-text-tertiary">Bye week</span>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {week.status === "complete" && week.result && (
          <>
            <span className="font-mono tabular-nums text-body-sm text-text-secondary">
              {week.points.toFixed(1)}
              <span className="text-text-tertiary"> - </span>
              {week.opponentPoints.toFixed(1)}
            </span>
            <ResultBadge result={week.result} />
          </>
        )}
        {week.isLive && <LiveIndicator />}
        {week.isUpcoming && (
          <span className="text-kicker text-text-tertiary">Upcoming</span>
        )}
      </div>
    </div>
  );

  if (!opponent) {
    return content;
  }

  return (
    <Link
      href={`/matchups/${seasonYear}/${week.week}/${week.matchupId}`}
      className="block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      aria-label={`Week ${week.week}: versus ${opponent.franchiseName}, view matchup detail`}
    >
      {content}
    </Link>
  );
}
