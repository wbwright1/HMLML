import { formatAwardChip, getAwardMeta } from "@/lib/awards";

export interface AwardChipData {
  awardType: string;
  seasonYear: number;
}

/**
 * Compact gold award badge, e.g. "MVP '25". Always carries its text label, so
 * the gold treatment never conveys meaning by color alone. Presentational and
 * server/client-safe (no client-only hooks). `title` gives the full award name
 * on hover for context.
 */
export function AwardChip({ awardType, seasonYear }: AwardChipData) {
  const meta = getAwardMeta(awardType);
  const label = formatAwardChip(awardType, seasonYear);
  const title = meta ? `${meta.label} · ${seasonYear}` : label;
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full bg-accent-gold-light px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.04em] text-accent-gold"
    >
      {label}
    </span>
  );
}

/**
 * A row of AwardChips for a player (season-descending), rendered inline. Renders
 * nothing when there are no badges.
 */
export function AwardChipRow({
  awards,
  className = "",
}: {
  awards: AwardChipData[];
  className?: string;
}) {
  if (awards.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {awards.map((a) => (
        <AwardChip key={`${a.awardType}-${a.seasonYear}`} {...a} />
      ))}
    </span>
  );
}
