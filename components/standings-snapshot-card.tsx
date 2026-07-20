import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { SNARKY_LABELS } from "@/lib/content";

interface StandingsEntry {
  rank: number;
  franchiseName: string;
  franchiseSlug: string;
  record: string;
  abbreviation?: string | null;
  brandingColor?: string | null;
}

interface StandingsSnapshotCardProps {
  standings: StandingsEntry[];
  week: number;
  seasonYear: number;
  /** Rank after which the "playoff line" divider is drawn. Defaults to 6. */
  playoffLineAfter?: number;
}

/**
 * "The Ladder" — the hub's full standings rail. Renders every team with its
 * crest, a gold-tinted leader row, a serif "the playoff line" divider after the
 * playoff cutoff, and doormat styling (rust + snarky label) on last place.
 * On mobile the mid-pack rows collapse, leaving the top of the table, the
 * playoff line, and the doormat.
 */
export function StandingsSnapshotCard({
  standings,
  playoffLineAfter = 6,
}: StandingsSnapshotCardProps) {
  if (standings.length === 0) return null;

  const lastRank = standings[standings.length - 1].rank;

  return (
    <div className="card-surface overflow-hidden">
      <ul className="divide-y divide-divider">
        {standings.map((entry) => {
          const isLeader = entry.rank === 1;
          const isDoormat = entry.rank === lastRank && standings.length > 3;
          // Collapse mid-pack rows on mobile: keep the top of the table, the
          // playoff line, and the doormat.
          const collapseOnMobile =
            entry.rank > playoffLineAfter + 1 && !isDoormat;

          return (
            <li key={entry.franchiseSlug}>
              <LadderRow
                entry={entry}
                isLeader={isLeader}
                isDoormat={isDoormat}
                collapseOnMobile={collapseOnMobile}
              />
              {entry.rank === playoffLineAfter &&
                entry.rank !== lastRank && <PlayoffLine />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlayoffLine() {
  return (
    <div
      className="flex items-center gap-3 px-4 py-1.5"
      aria-hidden="true"
    >
      <span className="h-px flex-1 bg-accent-gold/30" />
      <span className="font-serif italic text-sm leading-none text-accent-gold/80">
        the playoff line
      </span>
      <span className="h-px flex-1 bg-accent-gold/30" />
    </div>
  );
}

function LadderRow({
  entry,
  isLeader,
  isDoormat,
  collapseOnMobile,
}: {
  entry: StandingsEntry;
  isLeader: boolean;
  isDoormat: boolean;
  collapseOnMobile: boolean;
}) {
  const rankColor = isLeader
    ? "text-accent-gold"
    : isDoormat
      ? "text-accent-warm"
      : "text-text-tertiary";

  const nameColor = isLeader
    ? "font-bold text-text-primary"
    : isDoormat
      ? "font-medium text-accent-warm"
      : "font-medium text-text-secondary";

  return (
    <Link
      href={`/teams/${entry.franchiseSlug}`}
      className={`${
        collapseOnMobile ? "hidden md:flex" : "flex"
      } items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-muted ${
        isLeader ? "bg-accent-gold-light" : isDoormat ? "bg-accent-warm-light" : ""
      }`}
    >
      <span
        className={`text-stat text-sm w-6 text-center shrink-0 ${rankColor}`}
      >
        {entry.rank}
      </span>
      <FranchiseLogo
        slug={entry.franchiseSlug}
        name={entry.franchiseName}
        abbreviation={entry.abbreviation ?? undefined}
        brandingColor={entry.brandingColor ?? undefined}
        size="sm"
        decorative
      />
      <span className={`text-body flex-1 min-w-0 truncate ${nameColor}`}>
        {entry.franchiseName}
      </span>
      {isDoormat && (
        <span className="hidden sm:inline text-body-sm font-serif italic text-accent-warm shrink-0">
          {SNARKY_LABELS.LEAGUE_DOORMAT.displayText.toLowerCase()}
        </span>
      )}
      <span
        className={`text-stat text-sm shrink-0 tabular-nums ${
          isLeader ? "text-text-primary" : "text-text-tertiary"
        }`}
      >
        {entry.record}
      </span>
    </Link>
  );
}
