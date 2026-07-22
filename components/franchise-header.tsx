import { FranchiseLogo } from "@/components/franchise-logo";
import { ChampionshipStars } from "@/components/championship-stars";

interface FranchiseHeaderProps {
  franchiseName: string;
  franchiseSlug: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl?: string | null;
  ownerName?: string;
  coOwnerName?: string;
  seasonRange?: { start: number; end?: number };
  allTimeRecord: { wins: number; losses: number };
  championships: number;
  currentSeason?: { record: string; rank: number };
  /** Current season's division name (e.g. "Division 2"); omitted for
   * legacy/pre-division seasons. */
  division?: string;
}

export function FranchiseHeader({
  franchiseName,
  franchiseSlug,
  abbreviation,
  brandingColor,
  avatarUrl,
  ownerName,
  coOwnerName,
  seasonRange,
  allTimeRecord,
  championships,
  currentSeason,
  division,
}: FranchiseHeaderProps) {
  const totalGames = allTimeRecord.wins + allTimeRecord.losses;
  const winPct = totalGames > 0 ? (allTimeRecord.wins / totalGames) * 100 : 0;

  const ownerLabel = ownerName
    ? seasonRange
      ? `Owned by ${ownerName}${coOwnerName ? ` & ${coOwnerName}` : ""} (${seasonRange.start}${seasonRange.end ? `-${seasonRange.end}` : "-present"})`
      : `Owned by ${ownerName}${coOwnerName ? ` & ${coOwnerName}` : ""}`
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <div
          className="shrink-0"
          style={
            brandingColor
              ? { boxShadow: `0 0 0 2px ${brandingColor}`, borderRadius: "27px" }
              : undefined
          }
        >
          <FranchiseLogo
            slug={franchiseSlug}
            name={franchiseName}
            abbreviation={abbreviation}
            brandingColor={brandingColor}
            avatarUrl={avatarUrl}
            size="xl"
            decorative
          />
        </div>
        <div className="space-y-2">
          {division && (
            <p className="text-kicker text-accent-gold">{division}</p>
          )}
          <h1 className="text-h1">{franchiseName}</h1>
          <ChampionshipStars count={championships} variant="hero" />
          {ownerLabel && (
            <p className="text-body-sm text-muted-foreground">{ownerLabel}</p>
          )}
        </div>
      </div>

      {/* Stat callouts */}
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-12 pt-2">
        {/* All-time record */}
        <div className="flex flex-col items-center text-center">
          <p className="text-caption text-muted-foreground mb-1">
            All-Time Record
          </p>
          <p className="text-[32px] leading-none font-mono font-bold tabular-nums text-text-primary">
            {allTimeRecord.wins}-{allTimeRecord.losses}
          </p>
          <p className="text-caption text-muted-foreground mt-0.5">
            {winPct.toFixed(1)}% win rate
          </p>
        </div>

        {/* Championships */}
        <div className="flex flex-col items-center text-center">
          <p className="text-caption text-muted-foreground mb-1">
            Championships
          </p>
          <p
            className={`text-[32px] leading-none font-mono font-bold tabular-nums ${
              championships > 0 ? "text-accent-gold" : "text-text-primary"
            }`}
          >
            {championships}
          </p>
          {championships > 0 && (
            <p className="text-caption text-accent-gold mt-0.5">
              {championships === 1 ? "Title" : "Titles"}
            </p>
          )}
        </div>

        {/* Current season */}
        {currentSeason && (
          <div className="flex flex-col items-center text-center">
            <p className="text-caption text-muted-foreground mb-1">
              Current Season
            </p>
            <p className="text-[32px] leading-none font-mono font-bold tabular-nums text-text-primary">
              {currentSeason.record}
            </p>
            <p className="text-caption text-muted-foreground mt-0.5">
              #{currentSeason.rank} in standings
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
