import { TrackingIsland } from "@/components/book/tracking-island";
import { StreakWatch } from "@/components/book/streak-watch";
import type {
  AtsLeaderboardRow,
  BookGame,
  PickemsGridData,
  StreakTile,
} from "@/lib/book/shared";

/**
 * The Tracking tab: the pick strip, season ATS leaderboard and pick'ems grid
 * (left) with Streak Watch (right), matching the design's minmax(0,1fr) 340px
 * layout. Server component: all the data is fetched by app/book/page.tsx up
 * front, so this only lays it out. Session-dependent bits (the "YOU" column,
 * the viewer's own open picks) and the pick controls themselves live inside
 * TrackingIsland, the one client boundary.
 */
export function TrackingPane({
  leaderboard,
  grid,
  games,
  streakTiles,
  week,
}: {
  leaderboard: AtsLeaderboardRow[];
  grid: PickemsGridData;
  games: BookGame[];
  streakTiles: StreakTile[];
  week: number;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <TrackingIsland
        leaderboard={leaderboard}
        grid={grid}
        games={games}
        week={week}
      />
      <StreakWatch tiles={streakTiles} />
    </div>
  );
}
