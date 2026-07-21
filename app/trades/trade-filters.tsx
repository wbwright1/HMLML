"use client";

import { useRouter } from "next/navigation";

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
  selectedSeason?: string;
  selectedTeam?: string;
}

export function TradeFilters({
  seasons,
  teams,
  selectedSeason,
  selectedTeam,
}: TradeFiltersProps) {
  const router = useRouter();

  function handleChange(kind: "season" | "team", value: string) {
    const params = new URLSearchParams();
    const season = kind === "season" ? value : selectedSeason;
    const team = kind === "team" ? value : selectedTeam;

    if (season) params.set("season", season);
    if (team) params.set("team", team);

    const qs = params.toString();
    router.push(`/trades${qs ? `?${qs}` : ""}`);
  }

  const selectStyle: React.CSSProperties = {
    WebkitAppearance: "none",
    MozAppearance: "none",
    appearance: "none",
    width: "100%",
    borderRadius: "0.625rem",
    backgroundColor: "var(--surface-muted)",
    paddingLeft: "1rem",
    paddingRight: "2.5rem",
    paddingTop: "0.625rem",
    paddingBottom: "0.625rem",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "var(--text-primary)",
    border: "1px solid var(--border)",
    cursor: "pointer",
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <label htmlFor="trade-season" className="text-kicker block mb-1.5">
          Season
        </label>
        <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
          <select
            id="trade-season"
            value={selectedSeason ?? ""}
            onChange={(e) => handleChange("season", e.target.value)}
            style={selectStyle}
          >
            <option value="">All seasons</option>
            {seasons.map((s) => (
              <option key={s.seasonYear} value={String(s.seasonYear)}>
                {s.seasonYear}
              </option>
            ))}
          </select>
          <Chevron />
        </div>
      </div>

      <div className="flex-1">
        <label htmlFor="trade-team" className="text-kicker block mb-1.5">
          Team
        </label>
        <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
          <select
            id="trade-team"
            value={selectedTeam ?? ""}
            onChange={(e) => handleChange("team", e.target.value)}
            style={selectStyle}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
          <Chevron />
        </div>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg
      style={{
        position: "absolute",
        right: "0.75rem",
        top: "50%",
        transform: "translateY(-50%)",
        width: "1rem",
        height: "1rem",
        color: "var(--text-tertiary)",
        pointerEvents: "none",
      }}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
