import type { ReactNode } from "react";

type CalloutTone = "gold" | "sting" | "neutral";

export interface SignatureCallout {
  kicker: string;
  value: ReactNode;
  subline: string;
  tone: CalloutTone;
}

const toneClasses: Record<CalloutTone, string> = {
  gold: "border-accent-gold/25 bg-accent-gold-light",
  sting: "border-accent-warm/25 bg-accent-warm-light",
  neutral: "border-border bg-surface",
};

const valueToneClasses: Record<CalloutTone, string> = {
  gold: "text-accent-gold",
  sting: "text-accent-warm",
  neutral: "text-text-primary",
};

/**
 * Above-the-fold band of self-contained emotional callouts for a franchise:
 * a screenshot-worthy row of brag/wound stats. Horizontal snap-scroll on
 * mobile, an even grid on desktop. Positive stats are gold-tinted, "sting"
 * stats warm-rust-tinted (never color alone — each has a kicker + subline).
 */
export function FranchiseSignatureBand({
  callouts,
}: {
  callouts: SignatureCallout[];
}) {
  if (callouts.length === 0) return null;

  return (
    <div
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:pb-0 lg:grid-cols-5"
      role="list"
      aria-label="Franchise highlights"
    >
      {callouts.map((c, i) => (
        <div
          key={i}
          role="listitem"
          className={`flex min-w-[68%] snap-start flex-col justify-between rounded-[14px] border p-4 sm:min-w-0 ${toneClasses[c.tone]}`}
        >
          <p className="text-kicker">{c.kicker}</p>
          <p
            className={`mt-3 font-mono font-bold tabular-nums leading-none text-[30px] ${valueToneClasses[c.tone]}`}
          >
            {c.value}
          </p>
          <p className="mt-2 text-caption normal-case tracking-normal text-text-tertiary">
            {c.subline}
          </p>
        </div>
      ))}
    </div>
  );
}
