import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { getLeaderboard, getSeasonYears } from "@/lib/queries/records";
import { LeaderboardTable } from "@/app/records/leaderboard-table";
import type { LeaderboardEntry } from "@/lib/queries/records";

export const metadata = {
  title: "Records & Rankings | Harambe Memorial League Memorial League",
  description:
    "All-time leaderboard, head-to-head records, rivalries, and trophy case for the Harambe Memorial League Memorial League.",
};

const subPages = [
  {
    href: "/records/head-to-head",
    label: "Head-to-Head",
    description: "Compare any two franchises all-time",
  },
  {
    href: "/records/rivalries",
    label: "Rivalries",
    description: "The closest and most played matchups",
  },
  {
    href: "/records/power-rankings",
    label: "Power Rankings",
    description: "Current season standings and context",
  },
  {
    href: "/records/trophies",
    label: "Trophy Case",
    description: "Every champion in league history",
  },
];

export default async function RecordsPage() {
  let allTimeData: LeaderboardEntry[] = [];
  let seasonYears: number[] = [];
  const seasonDataRecord: Record<string, LeaderboardEntry[]> = {};

  try {
    [allTimeData, seasonYears] = await Promise.all([
      getLeaderboard(),
      getSeasonYears(),
    ]);

    // Pre-fetch leaderboard data for each season
    const seasonResults = await Promise.all(
      seasonYears.map(async (year) => {
        const data = await getLeaderboard(year);
        return [year, data] as [number, LeaderboardEntry[]];
      })
    );
    for (const [year, data] of seasonResults) {
      seasonDataRecord[String(year)] = data;
    }
  } catch {
    // DB may not be connected
  }

  return (
    <>
      <PageSection label="All-Time" title="Records & Rankings">
        <p className="text-body-lg text-muted-foreground max-w-prose">
          The definitive record book for the Harambe Memorial League Memorial League — career
          stats, head-to-head records, and every milestone worth remembering.
        </p>

        {/* Sub-page navigation cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          {subPages.map((page, index) => (
            <ScrollReveal key={page.href} delay={index * 60}>
              <Link
                href={page.href}
                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <p className="text-sm font-semibold text-primary">
                  {page.label}
                </p>
                <p className="text-xs text-muted-foreground mt-1 hidden sm:block">
                  {page.description}
                </p>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      </PageSection>

      <PageSection label="Leaderboard" title="All-Time Standings">
        <LeaderboardTable
          allTimeData={allTimeData}
          seasonData={seasonDataRecord}
          seasonYears={seasonYears}
        />
      </PageSection>
    </>
  );
}
