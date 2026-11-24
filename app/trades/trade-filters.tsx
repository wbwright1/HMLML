"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

interface SeasonOption {
  seasonYear: number;
}

interface TeamOption {
  slug: string;
  name: string;
}

interface TradeFiltersProps {
  seasons: SeasonOption[];
  teams: TeamOption[];
  /** The effective season scope: a year string, or "all" for every season. */
  selectedSeason?: string;
  selectedTeam?: string;
}

const SELECT_CLASS =
  "h-11 w-full cursor-pointer appearance-none rounded-[10px] border border-border-control bg-transparent pl-3 pr-9 text-body-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export function TradeFilters({
  seasons,
  teams,
  selectedSeason,
  selectedTeam,
}: TradeFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic copies so a pick shows at once while the filtered list loads
  // (a select pinned to the server prop would snap back until the navigation
  // commits); they settle back onto the new server props when it does.
  const [filters, setFilters] = useOptimistic({
    season: selectedSeason ?? "all",
    team: selectedTeam ?? "",
  });
  const { season, team } = filters;

  function handleChange(kind: "season" | "team", value: string) {
    const params = new URLSearchParams();
    const nextSeason = kind === "season" ? value : season;
    const nextTeam = kind === "team" ? value : team;

    if (nextSeason) params.set("season", nextSeason);
    if (nextTeam) params.set("team", nextTeam);

    const qs = params.toString();
    startTransition(() => {
      setFilters({ season: nextSeason, team: nextTeam });
      router.push(`/trades${qs ? `?${qs}` : ""}`);
    });
  }

  return (
    <div
      className={`grid grid-cols-2 gap-2 sm:max-w-xl sm:gap-4 transition-opacity duration-150 ${isPending ? "opacity-70" : ""}`}
      aria-busy={isPending}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="trade-season" className="text-kicker">
          Season
        </label>
        <div className="relative">
          <select
            id="trade-season"
            value={season}
            onChange={(e) => handleChange("season", e.target.value)}
            className={SELECT_CLASS}
          >
            {seasons.map((s) => (
              <option key={s.seasonYear} value={String(s.seasonYear)}>
                {s.seasonYear}
              </option>
            ))}
            <option value="all">All seasons</option>
          </select>
          <SelectChevron />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="trade-team" className="text-kicker">
          Team
        </label>
        <div className="relative">
          <select
            id="trade-team"
            value={team}
            onChange={(e) => handleChange("team", e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
          <SelectChevron />
        </div>
      </div>
    </div>
  );
}

function SelectChevron() {
  return (
    <ChevronDown
      className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
      strokeWidth={2}
      aria-hidden
    />
  );
}
