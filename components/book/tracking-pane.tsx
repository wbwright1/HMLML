import { TrackingIsland } from "@/components/book/tracking-island";
import { StreakWatch } from "@/components/book/streak-watch";
import type {
  AtsLeaderboardRow,
  StreakTile,
  WhoPickedWhomData,
} from "@/lib/book/shared";

/**
 * The Tracking tab: season ATS leaderboard + Who Picked Whom grid (left) and
 * Streak Watch (right), matching the design's minmax(0,1fr) 340px layout.
 * Server component: all the data is fetched by app/book/page.tsx up front, so
 * this only lays it out. Session-dependent bits (the "YOU" tag, the viewer's
 * own open picks) live inside TrackingIsland, the one client boundary.
 */
export function TrackingPane({
  leaderboard,
  grid,
  streakTiles,
  week,
}: {
  leaderboard: AtsLeaderboardRow[];
  grid: WhoPickedWhomData;
  streakTiles: StreakTile[];
  week: number;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <TrackingIsland leaderboard={leaderboard} grid={grid} week={week} />
      <StreakWatch tiles={streakTiles} />
    </div>
  );
}
