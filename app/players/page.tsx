import { SyncTimestamp } from "@/components/sync-timestamp";
import { getAllPlayersWithStats, getAllFranchiseNames } from "@/lib/queries/players";
import { PlayerTable } from "./player-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Players | Harambe Memorial League Memorial League",
  description:
    "Browse every player in the Harambe Memorial League Memorial League — sort by fantasy points, position, age, experience, and filter by team.",
};

interface PlayersPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const { q } = await searchParams;

  const [players, franchises] = await Promise.all([
    getAllPlayersWithStats(),
    getAllFranchiseNames(),
  ]);

  // Derive the stats season from the first player that has it
  const statsSeason = players.find((p) => p.statsSeason != null)?.statsSeason ?? null;

  return (
    <section className="py-8 md:py-12 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-kicker">
            Player Universe &middot; {players.length} Players
          </p>
          <h1 className="text-h1">Players.</h1>
        </div>
        <SyncTimestamp dataType="players" />
      </div>

      <PlayerTable
        players={players}
        franchises={franchises}
        statsSeason={statsSeason}
        initialQuery={q ?? ""}
      />
    </section>
  );
}
