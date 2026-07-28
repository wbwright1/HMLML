import {
  TrophyRow,
  type TrophyInstanceCellProps,
  type TrophyRowProps,
} from "@/components/trophy-row";
import { getAwardIcon, getAwardTypeIcon } from "@/lib/award-icons";
import { AWARD_METADATA } from "@/lib/awards";
import type { TrophyEntry } from "@/lib/queries/records";
import type { AwardsHonorRoll } from "@/lib/queries/awards";

interface LeagueTrophyShelfProps {
  championships: TrophyEntry[];
  roll: AwardsHonorRoll;
}

/**
 * The full league-wide Trophy Case: one horizontally-scrolling row per piece
 * of league hardware -- the League Champion row first (newest season first),
 * followed by one row per league award type (Regular Season MVP,
 * Championship MVP, Rookie of the Year), in canonical AWARD_TYPE_ORDER.
 * Award types with zero winners are omitted (the honor roll already filters
 * empty groups). Server component; renders null when there is nothing to show.
 */
export function LeagueTrophyShelf({
  championships,
  roll,
}: LeagueTrophyShelfProps) {
  const championCells: TrophyInstanceCellProps[] = championships
    .filter((t) => t.championName != null)
    .map((t) => ({
      seasonYear: t.seasonYear,
      franchise: {
        id: t.championFranchiseId!,
        slug: t.championSlug!,
        name: t.championName!,
        abbreviation: t.championAbbreviation,
        brandingColor: t.championBrandingColor,
        avatarUrl: t.championAvatarUrl,
      },
    }));

  const rows: TrophyRowProps[] = [];

  if (championCells.length > 0) {
    rows.push({
      icon: getAwardIcon("league champion"),
      label: "League Champion",
      cells: championCells,
    });
  }

  for (const group of roll.groups) {
    rows.push({
      icon: getAwardTypeIcon(group.awardType),
      label: AWARD_METADATA[group.awardType].label,
      cells: group.awards.map((award) => ({
        seasonYear: award.seasonYear,
        playerId: award.playerId,
        playerName: award.playerName,
        position: award.position,
        franchise: award.franchise,
      })),
    });
  }

  if (rows.length === 0) return null;

  return (
    <div data-testid="league-trophy-shelf" className="space-y-4">
      {rows.map((row) => (
        <TrophyRow key={row.label} {...row} />
      ))}
    </div>
  );
}
