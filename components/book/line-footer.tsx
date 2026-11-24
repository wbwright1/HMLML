import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MonoNumerals } from "@/components/book/mono-numerals";
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
        <span className="text-caption font-semibold text-text-secondary whitespace-nowrap">
          {/* Letters in Geist, numbers in mono: "VV -20.5 · ML -245/+200". */}
          <MonoNumerals text={footer.lineText} />
        </span>
        <span className="flex items-center gap-3">
          {footer.consensusText && (
            <span className="text-caption text-text-tertiary whitespace-nowrap">
              <MonoNumerals text={footer.consensusText} />
            </span>
          )}
          <Link
            href="/book"
            className="-my-3 inline-flex min-h-11 items-center gap-0.5 rounded-md text-caption font-semibold text-accent-gold hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            {footer.ctaLabel}
            <ChevronRight className="size-4" strokeWidth={2} aria-hidden="true" />
          </Link>
        </span>
      </div>
      {footer.dogPayoutLine && (
        <p className="mt-2 text-body-sm text-text-secondary">
          <MonoNumerals text={footer.dogPayoutLine} />
        </p>
      )}
    </>
  );
}
