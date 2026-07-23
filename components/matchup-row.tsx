import { FranchiseIdentity } from "@/components/franchise-identity";
import { LiveIndicator } from "@/components/live-indicator";
import { ResultBadge } from "@/components/franchise-schedule-row";

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

function teamResult(
  variant: "live" | "final" | "preview",
  mine: number,
  theirs: number
): "W" | "L" | "T" | null {
  if (variant !== "final") return null;
  if (mine === theirs) return "T";
  return mine > theirs ? "W" : "L";
}

export function MatchupRow({ matchup, variant = "final" }: MatchupRowProps) {
  const { homeTeam, awayTeam, homeScore, awayScore } = matchup;

  const homeWins = variant === "final" && homeScore > awayScore;
  const awayWins = variant === "final" && awayScore > homeScore;
  const homeResult = teamResult(variant, homeScore, awayScore);
  const awayResult = teamResult(variant, awayScore, homeScore);

  const ariaLabel =
    variant === "preview"
      ? `${homeTeam.franchiseName} versus ${awayTeam.franchiseName}`
      : `${homeTeam.franchiseName} ${homeScore.toFixed(1)} versus ${awayTeam.franchiseName} ${awayScore.toFixed(1)}`;

  const statusFooter =
    variant === "preview" ? (
      <span className="text-kicker">vs</span>
    ) : variant === "live" ? (
      <LiveIndicator />
    ) : (
      <span className="text-kicker">Final</span>
    );

  return (
    <div role="group" aria-label={ariaLabel}>
      {/* Mobile: stacked scorecard */}
      <div className="relative sm:hidden rounded-[14px] border border-border bg-surface p-4 overflow-hidden">
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: homeTeam.franchiseBrandingColor ?? "var(--border)" }}
          aria-hidden="true"
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-[3px]"
          style={{ backgroundColor: awayTeam.franchiseBrandingColor ?? "var(--border)" }}
          aria-hidden="true"
        />

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
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
              <span className="ml-auto flex items-center gap-2 shrink-0">
                <span
                  className={`font-mono tabular-nums text-lg ${
                    homeWins ? "font-bold text-text-primary" : "font-normal text-text-tertiary"
                  }`}
                >
                  {homeScore.toFixed(1)}
                </span>
                {homeResult && <ResultBadge result={homeResult} />}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
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
            {variant !== "preview" && (
              <span className="ml-auto flex items-center gap-2 shrink-0">
                <span
                  className={`font-mono tabular-nums text-lg ${
                    awayWins ? "font-bold text-text-primary" : "font-normal text-text-tertiary"
                  }`}
                >
                  {awayScore.toFixed(1)}
                </span>
                {awayResult && <ResultBadge result={awayResult} />}
              </span>
            )}
          </div>

          <div className="flex justify-center border-t border-divider pt-2">
            {statusFooter}
          </div>
        </div>
      </div>

      {/* Desktop: horizontal row */}
      <div className="relative hidden sm:flex items-center gap-3 rounded-[14px] border border-border bg-surface p-4 transition-colors hover:border-border-strong overflow-hidden">
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
          {statusFooter}
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
    </div>
  );
}
