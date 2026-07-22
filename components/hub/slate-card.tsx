interface SlateCardProps {
  teamAName: string;
  teamBName: string;
  /** All-time H2H record from team A's perspective, e.g. "6-0". */
  h2hRecord: string;
  /** Serif one-line angle for the matchup. */
  angle: string;
}

/**
 * One preview card in the between-weeks hub's "The Rest of the Slate" grid:
 * bold "TeamA vs TeamB", the all-time H2H record top-right (mono), and a serif
 * one-line angle below. Server component.
 */
export function SlateCard({ teamAName, teamBName, h2hRecord, angle }: SlateCardProps) {
  return (
    <div className="card-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-body font-semibold text-text-primary">
          {teamAName}
          <span className="font-normal text-text-tertiary"> vs </span>
          {teamBName}
        </p>
        <span className="text-stat tabular-nums text-body-sm text-text-tertiary shrink-0">
          {h2hRecord}
        </span>
      </div>
      <p className="mt-1.5 font-serif italic text-body-sm text-text-tertiary">
        {angle}
      </p>
    </div>
  );
}
