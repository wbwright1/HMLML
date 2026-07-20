import Link from "next/link";
import { LiveIndicator } from "@/components/live-indicator";

interface WeekBannerProps {
  week: number;
  seasonYear: number;
  state: "game-window" | "pre-kickoff" | "complete" | "playoff";
  gamesInProgress?: number;
  kickoffTime?: string; // "SUN 1PM ET"
  playoffRound?: string; // "Wild Card Round" | "Semifinal" | "Championship"
}

export function WeekBanner({
  week,
  seasonYear,
  state,
  gamesInProgress = 0,
  kickoffTime,
  playoffRound,
}: WeekBannerProps) {
  const headline =
    state === "playoff" && playoffRound ? playoffRound : `Week ${week}`;

  return (
    <section className="card-surface card-glows px-6 py-8 md:px-10 md:py-10">
      <p className="text-kicker mb-3">
        Harambe Memorial League &middot; {seasonYear}
      </p>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-h1">{headline}.</h1>

        {state === "game-window" && (
          <span className="flex items-center gap-2 text-body-sm text-text-tertiary">
            <LiveIndicator />
            {gamesInProgress} {gamesInProgress === 1 ? "game" : "games"} in progress
          </span>
        )}

        {state === "pre-kickoff" && kickoffTime && (
          <span className="text-body-sm text-text-tertiary">
            Games start {kickoffTime}
          </span>
        )}

        {state === "complete" && (
          <Link
            href={`/seasons/${seasonYear}/week/${week}`}
            className="text-body-sm text-accent-gold hover:brightness-110"
          >
            Week {week} Final &rarr;
          </Link>
        )}

        {state === "playoff" && (
          <span className="text-body-sm text-text-tertiary">
            {seasonYear} Playoffs &middot; Week {week}
          </span>
        )}
      </div>
    </section>
  );
}
