import { FranchiseLogo } from "@/components/franchise-logo";

export interface GameOfTheWeekTeam {
  name: string;
  slug: string;
  abbreviation: string | null;
  brandingColor: string | null;
  /** Per-season Sleeper crest; null falls back to the monogram. */
  avatarUrl: string | null;
  /** Season record, e.g. "8-2". */
  record: string;
  /** One-line status descriptor, e.g. "1st in Division 1"; null to omit. */
  status: string | null;
}

interface GameOfTheWeekCardProps {
  /** Top-left kicker, e.g. "DIVISION 1 REMATCH · FIRST PLACE ON THE LINE". */
  kicker: string;
  /** Top-right all-time series line, e.g. "All-time GW leads 14-9". */
  h2hLine: string;
  teamA: GameOfTheWeekTeam;
  teamB: GameOfTheWeekTeam;
  /** Serif trash-laced angle under the hairline. */
  blurb: string;
}

/**
 * Signature feature card for the between-weeks hub (state 1d): the marquee
 * matchup of the upcoming week. Gold-tinted card-surface with the ambient gold
 * radial blob, two teams flanking a serif "vs", all-time H2H line, and an
 * editorial blurb. Server component, zero client JS.
 */
export function GameOfTheWeekCard({
  kicker,
  h2hLine,
  teamA,
  teamB,
  blurb,
}: GameOfTheWeekCardProps) {
  return (
    <div className="card-surface card-tint-gold card-glows p-6 md:p-8">
      <div className="relative">
        {/* Header: kicker + all-time series */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <p className="text-kicker text-accent-gold">{kicker}</p>
          <p className="text-caption font-mono tabular-nums text-text-tertiary">{h2hLine}</p>
        </div>

        {/* Teams */}
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
          {/* Team A (left) */}
          <div className="flex items-center gap-3">
            <FranchiseLogo
              slug={teamA.slug}
              name={teamA.name}
              abbreviation={teamA.abbreviation ?? undefined}
              brandingColor={teamA.brandingColor ?? undefined}
              avatarUrl={teamA.avatarUrl}
              size="lg"
              decorative
            />
            <div className="min-w-0">
              <p className="text-h3 font-semibold text-text-primary">{teamA.name}</p>
              <p className="text-body-sm text-text-tertiary">
                <span className="text-stat tabular-nums">{teamA.record}</span>
                {teamA.status && <span> &middot; {teamA.status}</span>}
              </p>
            </div>
          </div>

          <p className="text-h3 font-serif italic text-text-tertiary text-center">
            vs
          </p>

          {/* Team B (right, mirrored on desktop) */}
          <div className="flex items-center gap-3 sm:flex-row-reverse sm:text-right">
            <FranchiseLogo
              slug={teamB.slug}
              name={teamB.name}
              abbreviation={teamB.abbreviation ?? undefined}
              brandingColor={teamB.brandingColor ?? undefined}
              avatarUrl={teamB.avatarUrl}
              size="lg"
              decorative
            />
            <div className="min-w-0">
              <p className="text-h3 font-semibold text-text-primary">{teamB.name}</p>
              <p className="text-body-sm text-text-tertiary">
                <span className="text-stat tabular-nums">{teamB.record}</span>
                {teamB.status && <span> &middot; {teamB.status}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Blurb under a hairline */}
        <hr className="mt-6 border-divider" />
        <p className="mt-4 font-serif italic text-body-lg text-text-secondary">
          {blurb}
        </p>
      </div>
    </div>
  );
}
