import {
  TrophyRow,
  type TrophyInstanceCellProps,
} from "@/components/trophy-row";
import { getAwardIcon, getAwardTypeIcon } from "@/lib/award-icons";
import {
  groupFranchiseTrophies,
  type FranchiseTrophy,
} from "@/lib/franchise-trophies";

interface FranchiseTrophyCaseProps {
  trophies: FranchiseTrophy[];
  franchiseName: string;
}

function toCell(trophy: FranchiseTrophy): TrophyInstanceCellProps {
  if (trophy.kind === "championship") {
    return { seasonYear: trophy.seasonYear };
  }

  return {
    seasonYear: trophy.seasonYear,
    playerId: trophy.playerId,
    playerName: trophy.playerName,
    position: trophy.position,
  };
}

/**
 * "Trophy Case" for a franchise page: one horizontally-scrolling row per
 * award type the franchise has won (championships first, then MVP /
 * Championship MVP / Rookie of the Year), zero-win award types omitted.
 * Server component; renders null when there is no hardware.
 */
export function FranchiseTrophyCase({
  trophies,
  franchiseName,
}: FranchiseTrophyCaseProps) {
  if (trophies.length === 0) return null;

  const groups = groupFranchiseTrophies(trophies);

  return (
    <div data-testid="franchise-trophy-case" className="space-y-4">
      {groups.map((group) => (
        <TrophyRow
          key={group.key}
          icon={
            group.key === "championship"
              ? getAwardIcon("league champion")
              : getAwardTypeIcon(group.key)
          }
          label={group.label}
          cells={group.trophies.map(toCell)}
        />
      ))}

      <span className="sr-only">
        {franchiseName}&rsquo;s trophy case, {trophies.length} piece
        {trophies.length !== 1 ? "s" : ""} of hardware.
      </span>
    </div>
  );
}
