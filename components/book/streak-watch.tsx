import type { StreakTile } from "@/lib/book/shared";

const TILE_STYLES: Record<
  StreakTile["kind"],
  { border: string; background: string; kicker: string }
> = {
  heater: {
    border: "border-accent-gold/25",
    background:
      "bg-[linear-gradient(180deg,rgba(226,184,88,.1),rgba(226,184,88,.02))]",
    kicker: "text-accent-gold",
  },
  "ice-cold": {
    border: "border-accent-warm/25",
    background:
      "bg-[linear-gradient(180deg,rgba(201,124,106,.1),rgba(201,124,106,.02))]",
    kicker: "text-accent-warm",
  },
  "best-week": {
    border: "border-accent-gold/25",
    background:
      "bg-[linear-gradient(180deg,rgba(226,184,88,.1),rgba(226,184,88,.02))]",
    kicker: "text-accent-gold",
  },
};

/**
 * Longest Heater, Ice Cold, and Best Single Week tiles.
 *
 * A plain server component: unlike the leaderboard and the grid, nothing here
 * depends on who is viewing the page, so it needs no client island. Tiles are
 * omitted entirely (not rendered empty) when the underlying claim isn't true
 * yet; see lib/queries/book-tracking.ts's getStreakWatch for the notability
 * thresholds.
 */
export function StreakWatch({ tiles }: { tiles: StreakTile[] }) {
  if (tiles.length === 0) {
    return (
      <aside>
        <p className="text-kicker mb-3">Streak Watch</p>
        <div className="card-surface p-5">
          <p className="text-body-sm text-text-secondary">
            No streak worth bragging (or hiding from) yet.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-3">
      <p className="text-kicker">Streak Watch</p>
      {tiles.map((tile) => {
        const style = TILE_STYLES[tile.kind];
        return (
          <div
            key={tile.kind}
            className={`rounded-[14px] border p-5 ${style.border} ${style.background}`}
          >
            <p
              className={`text-kicker mb-2 ${style.kicker}`}
            >
              {tile.kicker}
            </p>
            <p className="text-stat mb-1 text-[30px] leading-none text-text-primary">
              {tile.stat}
            </p>
            <p className="text-body-sm text-text-secondary">
              {tile.attribution}
            </p>
          </div>
        );
      })}
    </aside>
  );
}
