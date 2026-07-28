// Pure builder for the franchise-page "Trophy Case" rail: merges
// championships (from a franchise's season history) with the player-level
// league awards (MVP / Championship MVP / Rookie of the Year) its roster
// earned. Deliberately curated: only real hardware, no runner-up/finalist
// filler.

import type { AwardEntry } from "@/lib/queries/awards";
import {
  AWARD_METADATA,
  isAwardType,
  TROPHY_CASE_AWARD_ORDER,
  type AwardType,
} from "@/lib/awards";

export interface FranchiseTrophySeason {
  seasonYear: number;
  playoffResult: string | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
}

export type FranchiseTrophy =
  | {
      kind: "championship";
      seasonYear: number;
      wins: number | null;
      losses: number | null;
      ties: number | null;
    }
  | {
      kind: "award";
      seasonYear: number;
      awardType: AwardType;
      playerId: string | null;
      playerName: string;
      position: string | null;
    };

/**
 * Builds the trophy list for a franchise: championships first (season-year
 * descending), then player awards grouped by TROPHY_CASE_AWARD_ORDER (each
 * group already season-descending as returned by getFranchiseAwards). Repeat
 * winners each get their own card. Unknown award types (defensive, in case
 * the awards table ever grows beyond the three canonical types) are dropped
 * rather than shown unlabeled.
 */
export function buildFranchiseTrophies(
  seasonHistory: FranchiseTrophySeason[],
  awards: AwardEntry[],
): FranchiseTrophy[] {
  const championships: FranchiseTrophy[] = seasonHistory
    .filter((s) => s.playoffResult === "champion")
    .sort((a, b) => b.seasonYear - a.seasonYear)
    .map((s) => ({
      kind: "championship",
      seasonYear: s.seasonYear,
      wins: s.wins,
      losses: s.losses,
      ties: s.ties,
    }));

  const validAwards = awards.filter((a) => isAwardType(a.awardType));

  const playerAwards: FranchiseTrophy[] = TROPHY_CASE_AWARD_ORDER.flatMap(
    (awardType) =>
      validAwards
        .filter((a) => a.awardType === awardType)
        .map(
          (a): FranchiseTrophy => ({
            kind: "award",
            seasonYear: a.seasonYear,
            awardType: a.awardType,
            playerId: a.playerId,
            playerName: a.playerName,
            position: a.position,
          }),
        ),
  );

  return [...championships, ...playerAwards];
}

export type FranchiseTrophyGroupKey = "championship" | AwardType;

export interface FranchiseTrophyGroup {
  key: FranchiseTrophyGroupKey;
  label: string;
  trophies: FranchiseTrophy[]; // all same kind/awardType, season-descending
}

/**
 * Groups a flat trophy list into one row per award type (championships
 * first, then TROPHY_CASE_AWARD_ORDER). Award types with zero wins are
 * omitted entirely; trophies within a group keep their season-descending
 * order.
 */
export function groupFranchiseTrophies(
  trophies: FranchiseTrophy[],
): FranchiseTrophyGroup[] {
  const groups: FranchiseTrophyGroup[] = [];

  const championships = trophies.filter((t) => t.kind === "championship");
  if (championships.length > 0) {
    groups.push({
      key: "championship",
      label: "League Champion",
      trophies: championships,
    });
  }

  for (const awardType of TROPHY_CASE_AWARD_ORDER) {
    const matches = trophies.filter(
      (t) => t.kind === "award" && t.awardType === awardType,
    );
    if (matches.length > 0) {
      groups.push({
        key: awardType,
        label: AWARD_METADATA[awardType].label,
        trophies: matches,
      });
    }
  }

  return groups;
}
