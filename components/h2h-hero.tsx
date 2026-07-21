import { FranchiseIdentity } from "@/components/franchise-identity";
import { StatHero } from "@/components/stat-hero";
import { SuperlativeBadge } from "@/components/superlative-badge";

interface FranchiseData {
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  championships?: number;
}

interface H2HHeroProps {
  teamA: FranchiseData;
  teamB: FranchiseData;
  record: { wins: number; losses: number };
  streak?: string;
}

export function H2HHero({ teamA, teamB, record, streak }: H2HHeroProps) {
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
      </div>
    </div>
  );
}
