import { FranchiseIdentity } from "@/components/franchise-identity";
import { StatHero } from "@/components/stat-hero";
import { SuperlativeBadge } from "@/components/superlative-badge";
import type { RivalryLore } from "@/lib/rivalry-display";

interface FranchiseData {
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl?: string | null;
  championships?: number;
}

interface H2HHeroProps {
  teamA: FranchiseData;
  teamB: FranchiseData;
  record: { wins: number; losses: number };
  streak?: string;
  /** The commissioner-named rivalry for this pair, when one exists. */
  rivalry?: RivalryLore | null;
}

export function H2HHero({
  teamA,
  teamB,
  record,
  streak,
  rivalry,
}: H2HHeroProps) {
  const leader =
    record.wins > record.losses
      ? teamA.name
      : record.losses > record.wins
        ? teamB.name
        : null;

  const srText = leader
    ? `${leader === teamA.name ? teamA.name : teamB.name} leads ${leader === teamA.name ? teamB.name : teamA.name} ${Math.max(record.wins, record.losses)} to ${Math.min(record.wins, record.losses)} all-time`
    : `${teamA.name} and ${teamB.name} are tied ${record.wins} to ${record.losses} all-time`;

  return (
    <div className="space-y-6">
      {rivalry && (
        <div className="space-y-2 text-center" data-testid="h2h-rivalry">
          <p className="text-kicker">
            Named Rivalry
            {rivalry.originYear != null && (
              <>
                {" "}&middot; Since{" "}
                <span className="font-mono tabular-nums">
                  {rivalry.originYear}
                </span>
              </>
            )}
          </p>
          <h2 className="font-serif text-h1 italic text-accent-gold">
            {rivalry.name}
          </h2>
          {rivalry.tagline && (
            <p className="mx-auto max-w-prose font-serif text-body-lg italic text-text-secondary">
              {rivalry.tagline}
            </p>
          )}
        </div>
      )}

      <div className="sr-only">{srText}</div>

      <div
        className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10"
        aria-hidden="true"
      >
        {/* Team A */}
        <div className="flex-shrink-0">
          <FranchiseIdentity
            franchise={{
              slug: teamA.slug,
              name: teamA.name,
              abbreviation: teamA.abbreviation,
              brandingColor: teamA.brandingColor,
              avatarUrl: teamA.avatarUrl,
            }}
            championships={teamA.championships ?? 0}
            variant="standard"
          />
        </div>

        {/* Record */}
        <StatHero
          value={
            <span>
              <span className={record.wins > record.losses ? "text-accent-gold" : record.losses > record.wins ? "text-text-tertiary" : "text-text-primary"}>
                {record.wins}
              </span>
              {" - "}
              <span className={record.losses > record.wins ? "text-accent-gold" : record.wins > record.losses ? "text-text-tertiary" : "text-text-primary"}>
                {record.losses}
              </span>
            </span>
          }
          label="Head-to-Head Record"
          variant="xl"
        />

        {/* Team B */}
        <div className="flex-shrink-0">
          <FranchiseIdentity
            franchise={{
              slug: teamB.slug,
              name: teamB.name,
              abbreviation: teamB.abbreviation,
              brandingColor: teamB.brandingColor,
              avatarUrl: teamB.avatarUrl,
            }}
            championships={teamB.championships ?? 0}
            variant="standard"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="text-body-sm text-text-tertiary">
          All-time regular season
        </span>
        {streak && <SuperlativeBadge text={streak} variant="green" />}
        {rivalry?.trophyName && (
          <SuperlativeBadge text={rivalry.trophyName} variant="gold" />
        )}
      </div>

      {rivalry?.origin && (
        <aside
          aria-label="Rivalry origin"
          className="mx-auto max-w-prose border-l-2 border-accent-gold/40 pl-4 font-serif text-body italic text-text-tertiary"
        >
          {rivalry.origin}
        </aside>
      )}
    </div>
  );
}
