import { Medallion, MedallionShelf, PlayerAwardPlate } from "@/components/medallion-shelf";
import { formatRecord, getBowlName } from "@/lib/bowl-names";
import {
  groupFranchiseTrophies,
  type FranchiseTrophy,
} from "@/lib/franchise-trophies";
import type { MedallionIconType } from "@/lib/medallion-icons";

interface FranchiseTrophyCaseProps {
  trophies: FranchiseTrophy[];
  franchiseName: string;
}

type ChampionshipTrophy = Extract<FranchiseTrophy, { kind: "championship" }>;
type AwardTrophy = Extract<FranchiseTrophy, { kind: "award" }>;

function ChampionshipPlate({ trophy }: { trophy: ChampionshipTrophy }) {
  const record = formatRecord(trophy.wins, trophy.losses, trophy.ties);
  const bowlName = getBowlName(trophy.seasonYear);
  const subline = [record, bowlName].filter(Boolean).join(" · ");

  return (
    <div className="flex w-full items-center justify-center gap-2.5">
      <span className="font-mono text-[17px] font-bold text-accent-gold">
        {trophy.seasonYear}
      </span>
      {subline && (
        <span className="text-[10.5px] text-text-tertiary">{subline}</span>
      )}
    </div>
  );
}

function championshipAriaLabel(trophy: ChampionshipTrophy): string {
  const bowlName = getBowlName(trophy.seasonYear);
  const parts = ["League Champion", String(trophy.seasonYear)];
  if (bowlName) parts.push(bowlName);
  return `${parts.join(", ")}. View playoffs.`;
}

function awardAriaLabel(trophy: AwardTrophy, label: string): string {
  const parts = [label, trophy.playerName];
  if (trophy.position) parts.push(trophy.position);
  parts.push(String(trophy.seasonYear));
  return `${parts.join(", ")}. View player.`;
}

/**
 * Franchise page "Trophy Case": one Medallion Podium shelf per award-type
 * group returned by groupFranchiseTrophies (championships first, then league
 * awards in TROPHY_CASE_AWARD_ORDER). Server component, zero client JS.
 * Renders null when there is no hardware.
 */
export function FranchiseTrophyCase({
  trophies,
  franchiseName,
}: FranchiseTrophyCaseProps) {
  if (trophies.length === 0) return null;

  const groups = groupFranchiseTrophies(trophies);

  return (
    <div data-testid="franchise-trophy-case" className="space-y-6">
      {groups.map((group) => (
        <MedallionShelf
          key={group.key}
          label={group.label}
          count={group.trophies.length}
        >
          {group.key === "championship"
            ? group.trophies.map((trophy) => {
                const champTrophy = trophy as ChampionshipTrophy;
                return (
                  <Medallion
                    key={`champ-${champTrophy.seasonYear}`}
                    iconType={"champion" satisfies MedallionIconType}
                    href={`/playoffs/${champTrophy.seasonYear}`}
                    ariaLabel={championshipAriaLabel(champTrophy)}
                    plate={<ChampionshipPlate trophy={champTrophy} />}
                  />
                );
              })
            : group.trophies.map((trophy, index) => {
                const awardTrophy = trophy as AwardTrophy;
                return (
                  <Medallion
                    key={`award-${awardTrophy.awardType}-${awardTrophy.seasonYear}-${awardTrophy.playerId ?? index}`}
                    iconType={awardTrophy.awardType satisfies MedallionIconType}
                    href={
                      awardTrophy.playerId
                        ? `/players/${awardTrophy.playerId}`
                        : null
                    }
                    ariaLabel={awardAriaLabel(awardTrophy, group.label)}
                    plate={
                      <PlayerAwardPlate
                        playerId={awardTrophy.playerId}
                        playerName={awardTrophy.playerName}
                        position={awardTrophy.position}
                        seasonYear={awardTrophy.seasonYear}
                      />
                    }
                  />
                );
              })}
        </MedallionShelf>
      ))}

      <span className="sr-only">
        {franchiseName}&rsquo;s trophy case, {trophies.length} piece
        {trophies.length !== 1 ? "s" : ""} of hardware.
      </span>
    </div>
  );
}
