import { PageSection } from "@/components/page-section";
import { SyncTimestamp } from "@/components/sync-timestamp";
import { getAllPlayersWithStats, getAllFranchiseNames } from "@/lib/queries/players";
import { PlayerTable } from "./player-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Players | Harambe Memorial League Memorial League",
  description:
    "Browse every player in the Harambe Memorial League Memorial League — sort by fantasy points, position, age, experience, and filter by team.",
};

export default async function PlayersPage() {
  const [players, franchises] = await Promise.all([
    getAllPlayersWithStats(),
    getAllFranchiseNames(),
  ]);

  // Derive the stats season from the first player that has it
  const statsSeason = players.find((p) => p.statsSeason != null)?.statsSeason ?? null;

  return (
    <>
      <PageSection label="Player Database" title="Players">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-lg text-muted-foreground max-w-prose">
            Every player in the league database. Sort, filter, and search
            instantly.
          </p>
          <div className="shrink-0">
            <SyncTimestamp dataType="players" />
          </div>
        </div>

        <PlayerTable
          players={players}
          franchises={franchises}
          statsSeason={statsSeason}
        />
      </PageSection>
    </>
  );
}
