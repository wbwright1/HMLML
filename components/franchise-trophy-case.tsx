import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerLink } from "@/components/player-link";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { AWARD_METADATA } from "@/lib/awards";
import { getAwardIcon, getAwardTypeIcon } from "@/lib/award-icons";
import type { FranchiseTrophy } from "@/lib/franchise-trophies";

interface FranchiseTrophyCaseProps {
  trophies: FranchiseTrophy[];
  franchiseName: string;
}

function ChampionshipCard({ seasonYear }: { seasonYear: number }) {
  return (
    <div className="card-surface card-tint-gold flex h-full flex-col gap-3 p-5">
      <p className="text-kicker text-accent-gold flex items-center gap-1.5">
        {getAwardIcon("league champion")}
        Hardware
      </p>
      <SuperlativeBadge text="League Champion" variant="gold" />
      <span className="mt-auto font-mono text-h2 tabular-nums text-accent-gold">
        {seasonYear}
      </span>
    </div>
  );
}

function AwardCard({
  trophy,
}: {
  trophy: Extract<FranchiseTrophy, { kind: "award" }>;
}) {
  const meta = AWARD_METADATA[trophy.awardType];

  return (
    <div className="card-surface card-tint-gold flex h-full flex-col gap-3 p-5">
      <p className="text-kicker text-accent-gold flex items-center gap-1.5">
        {getAwardTypeIcon(trophy.awardType)}
        {meta.label}
      </p>
      <PlayerHeadshot
        playerId={trophy.playerId}
        name={trophy.playerName}
        size={72}
        showTeamBadge={false}
      />
      <div>
        <p className="text-body font-semibold text-text-primary">
          <PlayerLink playerId={trophy.playerId}>
            {trophy.playerName}
          </PlayerLink>
        </p>
        {trophy.position && (
          <p className="text-caption text-text-tertiary">{trophy.position}</p>
        )}
      </div>
      <span className="mt-auto font-mono text-body-sm font-bold tabular-nums text-accent-gold">
        {trophy.seasonYear}
      </span>
    </div>
  );
}

/**
 * Horizontally-scrolling "Trophy Case" rail for a franchise page: merges
 * championships and player-level league awards into one curated hardware
 * shelf. Server component (the only client leaf is PlayerHeadshot's image
 * fallback). Renders null when there is no hardware.
 */
export function FranchiseTrophyCase({
  trophies,
  franchiseName,
}: FranchiseTrophyCaseProps) {
  if (trophies.length === 0) return null;

  return (
    <div data-testid="franchise-trophy-case" className="space-y-3">
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 no-scrollbar">
        {trophies.map((trophy, index) => (
          <div
            key={
              trophy.kind === "championship"
                ? `champ-${trophy.seasonYear}`
                : `award-${trophy.awardType}-${trophy.seasonYear}-${trophy.playerId ?? index}`
            }
            className="snap-center shrink-0 basis-[72%] sm:basis-[52%] lg:basis-[240px]"
          >
            {trophy.kind === "championship" ? (
              <ChampionshipCard seasonYear={trophy.seasonYear} />
            ) : (
              <AwardCard trophy={trophy} />
            )}
          </div>
        ))}
      </div>

      <span className="sr-only">
        {franchiseName}&rsquo;s trophy case, {trophies.length} piece
        {trophies.length !== 1 ? "s" : ""} of hardware.
      </span>
    </div>
  );
}
