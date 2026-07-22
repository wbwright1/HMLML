import { FranchiseIdentity } from "@/components/franchise-identity";
import { LiveIndicator } from "@/components/live-indicator";

interface MatchupTeamInfo {
  franchiseId: string;
  franchiseName: string;
  franchiseSlug: string;
  franchiseAbbreviation: string | null;
  franchiseBrandingColor: string | null;
  avatarUrl?: string | null;
  points: number;
  isWinner: boolean | null;
}

interface MatchupRowProps {
  matchup: {
    homeTeam: MatchupTeamInfo;
    awayTeam: MatchupTeamInfo;
    homeScore: number;
    awayScore: number;
    status: string;
    matchupId: number;
  };
  variant?: "live" | "final" | "preview";
}

export function MatchupRow({ matchup, variant = "final" }: MatchupRowProps) {
  const { homeTeam, awayTeam, homeScore, awayScore } = matchup;

  const homeWins =
    variant === "final" && homeScore > awayScore;
  const awayWins =
    variant === "final" && awayScore > homeScore;

  const ariaLabel =
    variant === "preview"
      ? `${homeTeam.franchiseName} versus ${awayTeam.franchiseName}`
      : `${homeTeam.franchiseName} ${homeScore.toFixed(1)} versus ${awayTeam.franchiseName} ${awayScore.toFixed(1)}`;

  return (
    <div
      className="relative flex items-center gap-3 rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-border-strong overflow-hidden"
      role="group"
      aria-label={ariaLabel}
    >
      {/* Home team color accent */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ backgroundColor: homeTeam.franchiseBrandingColor ?? "var(--border)" }}
        aria-hidden="true"
      />

      {/* Home Team */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <FranchiseIdentity
              franchise={{
                slug: homeTeam.franchiseSlug,
                name: homeTeam.franchiseName,
                abbreviation: homeTeam.franchiseAbbreviation ?? undefined,
                brandingColor: homeTeam.franchiseBrandingColor ?? undefined,
                avatarUrl: homeTeam.avatarUrl,
              }}
              variant="compact"
            />
          </div>
          {variant !== "preview" && (
            <span
              className={`font-mono tabular-nums text-lg shrink-0 ${
                homeWins ? "font-bold text-text-primary" : "font-normal text-text-tertiary"
              }`}
            >
              {homeScore.toFixed(1)}
            </span>
          )}
        </div>
      </div>

      {/* Center Divider */}
      <div className="flex flex-col items-center justify-center shrink-0 w-12">
        {variant === "preview" ? (
          <span className="text-kicker">vs</span>
        ) : variant === "live" ? (
          <LiveIndicator />
        ) : (
          <span className="text-kicker">Final</span>
        )}
      </div>

      {/* Away Team */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          {variant !== "preview" && (
            <span
              className={`font-mono tabular-nums text-lg shrink-0 ${
                awayWins ? "font-bold text-text-primary" : "font-normal text-text-tertiary"
              }`}
            >
              {awayScore.toFixed(1)}
            </span>
          )}
          <div className="flex-1 min-w-0 flex justify-end">
            <FranchiseIdentity
              franchise={{
                slug: awayTeam.franchiseSlug,
                name: awayTeam.franchiseName,
                abbreviation: awayTeam.franchiseAbbreviation ?? undefined,
                brandingColor: awayTeam.franchiseBrandingColor ?? undefined,
                avatarUrl: awayTeam.avatarUrl,
              }}
              variant="compact"
            />
          </div>
        </div>
      </div>

      {/* Away team color accent */}
      <div
        className="absolute right-0 top-0 bottom-0 w-[3px] rounded-r-xl"
        style={{ backgroundColor: awayTeam.franchiseBrandingColor ?? "var(--border)" }}
        aria-hidden="true"
      />
    </div>
  );
}
