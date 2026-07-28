import { AlertTriangle } from "lucide-react";
import type { PlayerProfileIdentity } from "@/lib/queries/player-profile";

// Mirrors app/players/player-table.tsx's INJURY_LABELS / NEGATIVE_INJURY_STATUSES
// split: "Questionable" reads as a caution (gold), everything else as a hard
// negative (rust). Kept in lockstep by hand since the source lives in a page file.
const INJURY_LABELS: Record<string, string> = {
  Out: "Out",
  Doubtful: "Doubtful",
  Questionable: "Questionable",
  IR: "Injured Reserve",
  PUP: "Physically Unable to Perform",
  Suspended: "Suspended",
  NFI: "Non-Football Injury",
  COV: "COVID-19 List",
};

const NEGATIVE_INJURY_STATUSES = new Set([
  "Out",
  "Doubtful",
  "IR",
  "PUP",
  "Suspended",
  "NFI",
  "COV",
]);

interface InjuryBannerProps {
  identity: PlayerProfileIdentity;
}

/** Only renders when identity.injuryStatus is set. Never color alone. */
export function InjuryBanner({ identity }: InjuryBannerProps) {
  if (!identity.injuryStatus) return null;

  const label =
    INJURY_LABELS[identity.injuryStatus] ?? identity.injuryStatus;
  const isNegative = NEGATIVE_INJURY_STATUSES.has(identity.injuryStatus);
  const tintClass = isNegative ? "card-tint-warm" : "card-tint-gold";
  const textClass = isNegative ? "text-accent-warm" : "text-accent-gold";

  return (
    <div
      className={`card-surface ${tintClass} flex items-center gap-3 px-4 py-3 ${textClass}`}
    >
      <AlertTriangle className="size-5 shrink-0" strokeWidth={1.7} aria-hidden="true" />
      <p className="text-body-sm font-medium">{label}</p>
    </div>
  );
}
