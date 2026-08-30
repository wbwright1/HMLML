import Link from "next/link";
import type { BookLineFooter } from "@/lib/book/shared";

export type { BookLineFooter };

/**
 * The line row + optional dog-payout line, shared by LiveMatchupCard and
 * SlateCard so the two hub surfaces that borrow from The Book render it
 * identically. A plain server component; the caller supplies its own
 * top-border/spacing wrapper since the two hosts differ (a card footer vs. a
 * pre-kickoff preview card).
 */
export function BookLineFooterRow({ footer }: { footer: BookLineFooter }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="font-mono text-caption font-semibold normal-case tracking-normal tabular-nums text-text-secondary whitespace-nowrap">
          {footer.lineText}
        </span>
        <span className="flex items-center gap-3">
          {footer.consensusText && (
            <span className="text-caption normal-case tracking-normal text-text-tertiary whitespace-nowrap">
              {footer.consensusText}
            </span>
          )}
          <Link
            href="/book"
            className="text-caption font-semibold text-accent-gold hover:brightness-110 normal-case tracking-normal"
          >
            {footer.ctaLabel}
          </Link>
        </span>
      </div>
      {footer.dogPayoutLine && (
        <p className="mt-2 font-serif text-body-sm italic text-text-tertiary">
          {footer.dogPayoutLine}
        </p>
      )}
    </>
  );
}
