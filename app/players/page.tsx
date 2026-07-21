import { SyncTimestamp } from "@/components/sync-timestamp";
import { TrendingRail } from "@/components/trending-rail";
import { getAllPlayersWithStats, getAllFranchiseNames } from "@/lib/queries/players";
import { getLatestSeason } from "@/lib/queries/matchups";
import { getNflState } from "@/lib/queries/nfl-state";
import {
  getCurrentWeekProjectionsByPlayer,
  getTrendingAddPlayers,
} from "@/lib/queries/player-points";
import { PlayerTable, type PlayerRow } from "./player-table";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Players | Harambe Memorial League Memorial League",
  description:
    "Browse every player in the Harambe Memorial League Memorial League: sort by fantasy points, position, age, experience, and filter by team.",
};

interface PlayersPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const { q } = await searchParams;

  const [players, franchises, latestSeason, nflState, trendingPlayers] = await Promise.all([
    getAllPlayersWithStats(),
    getAllFranchiseNames(),
    getLatestSeason(),
    getNflState(),
    getTrendingAddPlayers(10),
  ]);

  // Derive the stats season from the first player that has it
  const statsSeason = players.find((p) => p.statsSeason != null)?.statsSeason ?? null;

  // PROJ only applies once the current season's hourly sync has populated a
  // projection for the current week; otherwise the column is omitted rather
  // than showing an all-dashes column (no sync yet / offseason).
  const isCurrentSeason =
    !!latestSeason && !!nflState && Number(nflState.season) === latestSeason.seasonYear;

  const projectionsByPlayer =
    isCurrentSeason && latestSeason && nflState
      ? await getCurrentWeekProjectionsByPlayer(latestSeason.id, nflState.week)
      : new Map<string, number>();

  const trendingCountByPlayer = new Map(
    trendingPlayers.map((p) => [p.playerId, p.count])
  );

  const showProjColumn = projectionsByPlayer.size > 0;
  const showTrdColumn = trendingCountByPlayer.size > 0;

  const playerRows: PlayerRow[] = players.map((player) => ({
    ...player,
    projPoints: projectionsByPlayer.get(player.id) ?? null,
    trendingCount: trendingCountByPlayer.get(player.id) ?? null,
  }));

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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_300px] lg:items-start">
        <PlayerTable
          players={playerRows}
          franchises={franchises}
          statsSeason={statsSeason}
          initialQuery={q ?? ""}
          showProjColumn={showProjColumn}
          showTrdColumn={showTrdColumn}
        />
        <aside className="hidden lg:block">
          <TrendingRail players={trendingPlayers} />
        </aside>
      </div>
    </section>
  );
}
