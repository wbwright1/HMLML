import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { SuperlativeBadge } from "@/components/superlative-badge";

export interface H2HGridRow {
  opponent: {
    name: string;
    slug: string;
    abbreviation?: string;
    brandingColor?: string;
    avatarUrl: string | null;
  };
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  /** "OWNS" on the best matchup, "OWNED BY" on the worst; null otherwise. */
  tag: "OWNS" | "OWNED BY" | null;
}

function RecordFigure({ row }: { row: H2HGridRow }) {
  return (
    <span className="font-mono text-sm tabular-nums whitespace-nowrap">
      <span className="font-bold text-text-primary">{row.wins}</span>
      <span className="text-xs text-text-tertiary ml-0.5">W</span>
      <span className="text-text-tertiary mx-1">-</span>
      <span className="text-text-secondary">{row.losses}</span>
      <span className="text-xs text-text-tertiary ml-0.5">L</span>
      {row.ties > 0 && (
        <>
          <span className="text-text-tertiary mx-1">-</span>
          <span className="text-text-secondary">{row.ties}</span>
          <span className="text-xs text-text-tertiary ml-0.5">T</span>
        </>
      )}
    </span>
  );
}

function WinBar({ pct, tag }: { pct: number; tag: H2HGridRow["tag"] }) {
  const fill =
    tag === "OWNS"
      ? "bg-accent-gold"
      : tag === "OWNED BY"
        ? "bg-accent-warm"
        : "bg-text-tertiary";
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
      aria-hidden="true"
    >
      <div
        className={`h-full rounded-full ${fill}`}
        style={{ width: `${Math.round(pct * 100)}%` }}
      />
    </div>
  );
}

function TagBadge({ tag }: { tag: H2HGridRow["tag"] }) {
  if (tag === "OWNS") return <SuperlativeBadge text="OWNS" variant="gold" />;
  if (tag === "OWNED BY")
    return <SuperlativeBadge text="OWNED BY" variant="brown" />;
  return null;
}

/**
 * "Who Owns Who": a franchise's lifetime record vs each other franchise,
 * sorted best-to-worst. Cards on mobile, compact rows on desktop. Every row
 * links to the head-to-head page with the pair preselected.
 */
export function FranchiseH2HGrid({
  franchiseSlug,
  rows,
}: {
  franchiseSlug: string;
  rows: H2HGridRow[];
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const pctLabel = `${(row.winPct * 100).toFixed(0)}% win rate`;
        return (
          <Link
            key={row.opponent.slug}
            href={`/records/head-to-head?a=${franchiseSlug}&b=${row.opponent.slug}`}
            className="block rounded-[14px] border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-muted"
            aria-label={`${row.opponent.name}: ${row.wins} wins, ${row.losses} losses${row.ties > 0 ? `, ${row.ties} ties` : ""}, ${pctLabel}`}
          >
            <div className="flex items-center gap-3">
              <FranchiseLogo
                slug={row.opponent.slug}
                name={row.opponent.name}
                abbreviation={row.opponent.abbreviation}
                brandingColor={row.opponent.brandingColor}
                avatarUrl={row.opponent.avatarUrl}
                size="sm"
                decorative
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-body-sm font-semibold text-text-primary">
                    {row.opponent.name}
                  </span>
                  <span className="shrink-0">
                    <TagBadge tag={row.tag} />
                  </span>
                </div>
                {/* Desktop: inline bar under the name */}
                <div className="mt-1.5 hidden sm:block">
                  <WinBar pct={row.winPct} tag={row.tag} />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <RecordFigure row={row} />
                <span className="font-mono text-xs tabular-nums text-text-tertiary">
                  {(row.winPct * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            {/* Mobile: full-width bar below the row */}
            <div className="mt-2 sm:hidden">
              <WinBar pct={row.winPct} tag={row.tag} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
