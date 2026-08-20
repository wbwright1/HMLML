import { BackLink } from "@/components/back-link";
import { PageSection } from "@/components/page-section";
import { EmptyState } from "@/components/empty-state";
import { LeagueTrophyShelf } from "@/components/league-trophy-shelf";
import { getTrophyCase } from "@/lib/queries/records";
import { getAwardsHonorRoll } from "@/lib/queries/awards";
import {
  getAllToiletBowlChampions,
  type ToiletBowlChampion,
} from "@/lib/queries/playoff-bracket";
import type { TrophyEntry } from "@/lib/queries/records";
import type { AwardsHonorRoll } from "@/lib/queries/awards";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Trophy Case | Harambe Memorial League Memorial League",
  description:
    "Championships and awards for the Harambe Memorial League Memorial League.",
};

export default async function TrophyCasePage() {
  const [trophiesResult, rollResult, toiletResult] = await Promise.allSettled([
    getTrophyCase(),
    getAwardsHonorRoll(),
    getAllToiletBowlChampions(),
  ]);

  const toiletBowlChampions: ToiletBowlChampion[] =
    toiletResult.status === "fulfilled" ? toiletResult.value : [];

  const trophies: TrophyEntry[] =
    trophiesResult.status === "fulfilled" ? trophiesResult.value : [];
  const roll: AwardsHonorRoll =
    rollResult.status === "fulfilled"
      ? rollResult.value
      : {
          groups: [],
          awardCountByPlayer: {},
          mostDecoratedPlayerId: null,
          total: 0,
        };

  const championships = trophies.filter((t) => t.championName != null);
  const isEmpty =
    championships.length === 0 &&
    roll.groups.length === 0 &&
    toiletBowlChampions.length === 0;

  return (
    <>
      <PageSection label="Records" title="Trophy Case.">
        <BackLink href="/records" label="All Records" />

        <p className="text-body-lg text-text-secondary max-w-prose">
          Every championship and accolade in league history.
        </p>
      </PageSection>

      <PageSection label="All Hardware" title="The Shelf">
        {isEmpty ? (
          <EmptyState
            icon="trophy"
            title="No Championship Data"
            description="Championship history will appear once season data has been synced."
            actionLabel="View seasons"
            actionHref="/seasons"
          />
        ) : (
          <LeagueTrophyShelf
            championships={championships}
            roll={roll}
            toiletBowlChampions={toiletBowlChampions}
          />
        )}
      </PageSection>
    </>
  );
}
