import { Medallion, MedallionShelf, PlayerAwardPlate } from "@/components/medallion-shelf";
import { FranchiseLogo } from "@/components/franchise-logo";
import { AWARD_METADATA, TROPHY_CASE_AWARD_ORDER } from "@/lib/awards";
import type { TrophyEntry } from "@/lib/queries/records";
import type { AwardEntry, AwardsHonorRoll } from "@/lib/queries/awards";
import type { MedallionIconType } from "@/lib/medallion-icons";
import type { ToiletBowlChampion } from "@/lib/queries/playoff-bracket";
import { SNARKY_LABELS } from "@/lib/content";

interface LeagueTrophyShelfProps {
  championships: TrophyEntry[];
  roll: AwardsHonorRoll;
  toiletBowlChampions?: ToiletBowlChampion[];
}

/** Plate content for a League Champion medallion: franchise crest (plain, no
 * nested link -- the enclosing Medallion is already the /teams/ tap target) +
 * franchise name + season year. */
function LeagueChampionPlate({ trophy }: { trophy: TrophyEntry }) {
  return (
    <div className="flex w-full items-center gap-2.5">
      <FranchiseLogo
        slug={trophy.championSlug!}
        name={trophy.championName!}
        abbreviation={trophy.championAbbreviation ?? undefined}
        brandingColor={trophy.championBrandingColor ?? undefined}
        avatarUrl={trophy.championAvatarUrl}
        size={40}
        decorative
      />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-text-primary">
          {trophy.championName}
        </span>
        <span className="block whitespace-nowrap text-[10px] text-text-tertiary">
          <span className="font-mono text-accent-gold">{trophy.seasonYear}</span>
        </span>
      </span>
    </div>
  );
}

function championAriaLabel(trophy: TrophyEntry): string {
  return `${trophy.championName}, League Champion, ${trophy.seasonYear}. View team.`;
}

/** Award plate: the shared PlayerAwardPlate, plus a small plain (non-link)
 * franchise crest + name row underneath when the award has a franchise. */
function AwardPlate({ award }: { award: AwardEntry }) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <PlayerAwardPlate
        playerId={award.playerId}
        playerName={award.playerName}
        position={award.position}
        seasonYear={award.seasonYear}
      />
      {award.franchise && (
        <div className="flex min-w-0 items-center gap-1.5 pl-[50px]">
          <FranchiseLogo
            slug={award.franchise.slug}
            name={award.franchise.name}
            abbreviation={award.franchise.abbreviation ?? undefined}
            brandingColor={award.franchise.brandingColor ?? undefined}
            avatarUrl={award.franchise.avatarUrl}
            size={14}
            decorative
          />
          <span className="truncate text-[9px] text-text-tertiary">
            {award.franchise.name}
          </span>
        </div>
      )}
    </div>
  );
}

function awardAriaLabel(award: AwardEntry, label: string): string {
  const parts = [label, award.playerName];
  if (award.position) parts.push(award.position);
  parts.push(String(award.seasonYear));
  return `${parts.join(", ")}. View player.`;
}

/**
 * The full league-wide Trophy Case: a Medallion Podium shelf for the League
 * Champion (newest season first), followed by one shelf per league award
 * type in TROPHY_CASE_AWARD_ORDER (championship MVP first). Award types with
 * zero winners are omitted (the honor roll already filters empty groups).
 * Server component; renders null when there is nothing to show.
 */
export function LeagueTrophyShelf({
  championships,
  roll,
  toiletBowlChampions = [],
}: LeagueTrophyShelfProps) {
  const champions = championships.filter((t) => t.championName != null);

  const groupsByType = new Map(roll.groups.map((g) => [g.awardType, g]));
  const orderedGroups = TROPHY_CASE_AWARD_ORDER.map((type) =>
    groupsByType.get(type),
  ).filter((g): g is NonNullable<typeof g> => !!g && g.awards.length > 0);

  if (
    champions.length === 0 &&
    orderedGroups.length === 0 &&
    toiletBowlChampions.length === 0
  ) {
    return null;
  }

  return (
    <div data-testid="league-trophy-shelf" className="space-y-6">
      {champions.length > 0 && (
        <MedallionShelf label="League Champion" count={champions.length}>
          {champions.map((trophy) => (
            <Medallion
              key={`champ-${trophy.seasonYear}`}
              iconType={"champion" satisfies MedallionIconType}
              href={`/teams/${trophy.championSlug}`}
              ariaLabel={championAriaLabel(trophy)}
              plate={<LeagueChampionPlate trophy={trophy} />}
            />
          ))}
        </MedallionShelf>
      )}

      {orderedGroups.map((group) => (
        <MedallionShelf
          key={group.awardType}
          label={AWARD_METADATA[group.awardType].label}
          count={group.awards.length}
        >
          {group.awards.map((award) => (
            <Medallion
              key={`award-${award.id}`}
              iconType={award.awardType satisfies MedallionIconType}
              href={award.playerId ? `/players/${award.playerId}` : null}
              ariaLabel={awardAriaLabel(award, AWARD_METADATA[group.awardType].label)}
              plate={<AwardPlate award={award} />}
            />
          ))}
        </MedallionShelf>
      ))}

      {/* The shelf nobody wants a spot on. Same podium treatment, tarnished. */}
      {toiletBowlChampions.length > 0 && (
        <MedallionShelf
          label={SNARKY_LABELS.TOILET_BOWL_CHAMPION.displayText}
          count={toiletBowlChampions.length}
          tone="shame"
        >
          {toiletBowlChampions.map((champion) => (
            <Medallion
              key={`toilet-${champion.seasonYear}`}
              iconType={"toilet_bowl" satisfies MedallionIconType}
              href={`/playoffs/${champion.seasonYear}`}
              ariaLabel={`${champion.franchiseName}, Toilet Bowl Champion, ${champion.seasonYear}. View playoffs.`}
              plate={<ToiletBowlPlate champion={champion} />}
            />
          ))}
        </MedallionShelf>
      )}
    </div>
  );
}

/** Plate for a Toilet Bowl medallion: crest, franchise name, season in rust. */
function ToiletBowlPlate({ champion }: { champion: ToiletBowlChampion }) {
  return (
    <div className="flex w-full items-center gap-2.5">
      <FranchiseLogo
        slug={champion.franchiseSlug}
        name={champion.franchiseName}
        abbreviation={champion.franchiseAbbreviation ?? undefined}
        brandingColor={champion.franchiseBrandingColor ?? undefined}
        avatarUrl={champion.avatarUrl}
        size={40}
        decorative
      />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-text-primary">
          {champion.franchiseName}
        </span>
        <span className="block whitespace-nowrap text-[10px] text-text-tertiary">
          <span className="font-mono text-accent-warm">
            {champion.seasonYear}
          </span>
          <span> · Dead Last</span>
        </span>
      </span>
    </div>
  );
}
