import Link from "next/link";

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
    <section
      className="relative w-full overflow-hidden"
      style={{
        background: "linear-gradient(135deg, var(--accent-green) 0%, #1a3d28 100%)",
      }}
    >
      <div className="mx-auto max-w-[1200px] px-4 py-12 md:py-16 text-center">
        <p
          className="text-caption uppercase tracking-widest text-white/60 mb-3"
          aria-hidden="true"
        >
          Harambe Memorial League
        </p>

        <h1 className="text-h1 text-white mb-2">{headline}</h1>

        {state === "game-window" && (
          <p className="text-body text-white/75 flex items-center justify-center gap-2">
            <span
              className="relative inline-flex size-2"
              aria-hidden="true"
            >
              <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-white" />
            </span>
            {gamesInProgress} {gamesInProgress === 1 ? "game" : "games"} in progress
          </p>
        )}

        {state === "pre-kickoff" && kickoffTime && (
          <p className="text-body text-white/75">
            Games start {kickoffTime}
          </p>
        )}

        {state === "complete" && (
          <p className="text-body text-white/75">
            <Link
              href={`/seasons/${seasonYear}/week/${week}`}
              className="underline underline-offset-4 hover:text-white transition-colors"
            >
              Week {week} Final
            </Link>
          </p>
        )}

        {state === "playoff" && (
          <p className="text-body text-white/75">
            {seasonYear} Playoffs, Week {week}
          </p>
        )}
      </div>
    </section>
  );
}
