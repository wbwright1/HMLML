import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";

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
  /** Top-left kicker, e.g. "DIVISION 1 REMATCH · DIVISION LEAD AT STAKE". */
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
          <p className="text-kicker text-accent-gold" data-testid="gotw-kicker">
            {kicker}
          </p>
          <p className="text-caption font-mono tabular-nums text-text-tertiary">{h2hLine}</p>
        </div>

        {/* Teams */}
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
          {/* Team A (left) */}
          <div className="min-w-0">
            {/* ONE link over crest and name, not two to the same place. The
                record line below stays outside it. */}
            <TeamLink
              slug={teamA.slug}
              className="flex min-w-0 items-center gap-3 text-text-primary"
            >
              <FranchiseLogo
                slug={teamA.slug}
                name={teamA.name}
                abbreviation={teamA.abbreviation ?? undefined}
                brandingColor={teamA.brandingColor ?? undefined}
                avatarUrl={teamA.avatarUrl}
                size="lg"
                decorative
              />
              <span className="min-w-0 truncate text-h3 font-semibold">
                {teamA.name}
              </span>
            </TeamLink>
            <p className="mt-1 text-body-sm text-text-tertiary">
              <span className="text-stat tabular-nums">{teamA.record}</span>
              {teamA.status && <span> &middot; {teamA.status}</span>}
            </p>
          </div>

          <p className="text-h3 font-serif italic text-text-tertiary text-center">
            vs
          </p>

          {/* Team B (right, mirrored on desktop) */}
          <div className="min-w-0 sm:text-right">
            {/* ONE link over crest and name, not two to the same place. The
                record line below stays outside it. */}
            <TeamLink
              slug={teamB.slug}
              className="flex min-w-0 items-center gap-3 text-text-primary sm:flex-row-reverse"
            >
              <FranchiseLogo
                slug={teamB.slug}
                name={teamB.name}
                abbreviation={teamB.abbreviation ?? undefined}
                brandingColor={teamB.brandingColor ?? undefined}
                avatarUrl={teamB.avatarUrl}
                size="lg"
                decorative
              />
              <span className="min-w-0 truncate text-h3 font-semibold">
                {teamB.name}
              </span>
            </TeamLink>
            <p className="mt-1 text-body-sm text-text-tertiary">
              <span className="text-stat tabular-nums">{teamB.record}</span>
              {teamB.status && <span> &middot; {teamB.status}</span>}
            </p>
          </div>
        </div>

        {/* Blurb under a hairline */}
        <hr className="mt-6 border-divider" />
        <p
          className="mt-4 font-serif italic text-body-lg text-text-secondary"
          data-testid="gotw-blurb"
        >
          {blurb}
        </p>
      </div>
    </div>
  );
}
