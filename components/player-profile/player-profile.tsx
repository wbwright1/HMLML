import {
  getPlayerProfile,
  getPlayerWeeklyPoints,
  getPlayerWeeklyStats,
} from "@/lib/queries/player-profile";
import { ProfileIdentityHeader } from "./profile-identity-header";
import { InjuryBanner } from "./injury-banner";
import { ValueStatCallouts } from "./value-stat-callouts";
import { ValueChart } from "./value-chart";
import { ProjectedActual } from "./projected-actual";
import { WeeklyLinesTable } from "./weekly-lines-table";
import { OwnershipFacts } from "./ownership-facts";
import { CareerTimeline } from "./career-timeline";

export interface PlayerProfileProps {
  playerId: string;
  /** ?season= query param, unvalidated — this component validates against identity.seasonsPresent. */
  season?: string;
  variant: "page" | "modal";
}

/**
 * The full player-profile body, shared by the canonical /players/[id] page
 * and the intercepted modal route. Every section returns null when its data
 * is absent, so sparse players (no value history, no stats yet) still render
 * clean. Returns null when the player is unknown — callers decide how to
 * present that (notFound() on the page, in-shell 404 copy in the modal).
 */
export async function PlayerProfile({
  playerId,
  season,
  variant,
}: PlayerProfileProps) {
  const profile = await getPlayerProfile(playerId);
  if (!profile) return null;

  const { identity, timeline, valueSeries, ownershipFacts } = profile;

  const requestedSeason = season ? Number(season) : NaN;
  const selectedSeason = identity.seasonsPresent.includes(requestedSeason)
    ? requestedSeason
    : (identity.defaultSeason ?? null);

  const [weeklyPoints, weeklyStats] = selectedSeason
    ? await Promise.all([
        getPlayerWeeklyPoints(playerId, selectedSeason),
        getPlayerWeeklyStats(playerId, selectedSeason),
      ])
    : [[], []];

  return (
    <div className="space-y-8">
      <ProfileIdentityHeader identity={identity} variant={variant} />

      <InjuryBanner identity={identity} />

      <div className="space-y-3">
        <ValueStatCallouts valueSeries={valueSeries} position={identity.position} />
        <div className="card-surface p-4 sm:p-5">
          <p className="text-kicker text-text-tertiary mb-3">Dynasty Value</p>
          <ValueChart valueSeries={valueSeries} />
        </div>
      </div>

      {selectedSeason && (
        <ProjectedActual seasonYear={selectedSeason} weeklyPoints={weeklyPoints} />
      )}

      <div className="space-y-3">
        <p className="text-kicker text-text-tertiary">Weekly Lines</p>
        <WeeklyLinesTable
          playerId={playerId}
          position={identity.position}
          seasonsPresent={identity.seasonsPresent}
          selectedSeason={selectedSeason}
          weeklyPoints={weeklyPoints}
          weeklyStats={weeklyStats}
          variant={variant}
        />
      </div>

      <OwnershipFacts
        facts={ownershipFacts}
        franchiseHistory={profile.franchiseHistory}
      />

      <CareerTimeline timeline={timeline} />
    </div>
  );
}
