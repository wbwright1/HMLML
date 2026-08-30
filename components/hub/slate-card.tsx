import { BookLineFooterRow, type BookLineFooter } from "@/components/book/line-footer";

interface SlateCardProps {
  teamAName: string;
  teamBName: string;
  /** All-time H2H record from team A's perspective, e.g. "6-0". */
  h2hRecord: string;
  /** Serif one-line angle for the matchup. */
  angle: string;
  /** The Book's line footer, from book_lines. Omitted entirely when the game
   * has no priced line (genuinely optional data). Every slate card at this
   * stage is pre-kickoff, so this always carries the dog-payout line. */
  bookFooter?: BookLineFooter;
}

/**
 * One preview card in the between-weeks hub's "The Rest of the Slate" grid:
 * bold "TeamA vs TeamB", the all-time H2H record top-right (mono), and a serif
 * one-line angle below. Server component.
 */
export function SlateCard({ teamAName, teamBName, h2hRecord, angle, bookFooter }: SlateCardProps) {
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

      {bookFooter && (
        <div className="mt-3 pt-3 border-t border-divider">
          <BookLineFooterRow footer={bookFooter} />
        </div>
      )}
    </div>
  );
}
