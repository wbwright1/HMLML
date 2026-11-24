import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { PageSection } from "@/components/page-section";
import { EmptyState } from "@/components/empty-state";
import { MatchupRow } from "@/components/matchup-row";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { ScrollReveal } from "@/components/scroll-reveal";
import { ScorePoller } from "./score-poller";
import { getCurrentWeekMatchups } from "@/lib/queries/matchups";
import { getNamedRivalryLookup } from "@/lib/queries/named-rivalries-optional";
import { findNamedRivalry } from "@/lib/queries/rivalries";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).

/** 44px text link with a padded hit area and the standard focus ring. */
const NAV_LINK =
  "inline-flex min-h-11 items-center gap-1 rounded-md px-2 -mx-2 text-body-sm font-medium transition-[color,scale] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export const revalidate = 3600;

export const metadata = {
  title: "Matchups | Harambe Memorial League Memorial League",
  description:
    "This week's matchups and scores in the Harambe Memorial League Memorial League.",
};

export default async function MatchupsPage() {
  let data: Awaited<ReturnType<typeof getCurrentWeekMatchups>> = null;

  try {
    data = await getCurrentWeekMatchups();
  } catch (e) {
    rethrowUnlessTolerable(e);
    // DB may not be connected in dev
  }

  if (!data || data.matchups.length === 0) {
    return (
      <PageSection as="h1" title="Matchups">
        <EmptyState
          icon="calendar"
          title="No Matchups Available"
          description="Matchup data will appear once the season begins and scores are synced from Sleeper."
          actionLabel="Browse league history"
          actionHref="/seasons"
        />
      </PageSection>
    );
  }

  const { matchups, seasonYear, week } = data;

  // Named rivalries label their rows; optional lore, empty on a failed read.
  const rivalryLookup = await getNamedRivalryLookup();

  // Determine variant based on matchup status
  const getVariant = (status: string): "live" | "final" | "preview" => {
    if (status === "in_progress") return "live";
    if (status === "complete") return "final";
    return "preview";
  };

  // Are any matchups live or scheduled?
  const hasLiveMatchups = matchups.some((m) => m.status === "in_progress");
  const allComplete = matchups.every((m) => m.status === "complete");
  const allScheduled = matchups.every((m) => m.status === "scheduled");

  return (
    <>
      <PageSection
        as="h1"
        title={`Week ${week}`}
        intro={
          <>
            {allComplete
              ? "Final results"
              : hasLiveMatchups
                ? "Scores are updating live"
                : allScheduled
                  ? "Upcoming matchups"
                  : "Matchups in progress"}
            {hasLiveMatchups && (
              <span className="ml-2 align-middle">
                <SuperlativeBadge text="Live" variant="green" />
              </span>
            )}
          </>
        }
      >
        {/* Week navigation links */}
        <nav aria-label="Week navigation" className="flex flex-wrap items-center gap-x-2">
          {week > 1 && (
            <Link
              href={`/seasons/${seasonYear}/week/${week - 1}`}
              className={`${NAV_LINK} text-text-tertiary hover:text-text-primary`}
            >
              <ChevronLeft className="size-4" strokeWidth={2} aria-hidden />
              Week <span className="font-mono tabular-nums">{week - 1}</span>
            </Link>
          )}
          <Link
            href={`/seasons/${seasonYear}`}
            className={`${NAV_LINK} text-accent-gold hover:brightness-110`}
          >
            Full <span className="font-mono tabular-nums">{seasonYear}</span> season
          </Link>
          <Link
            href={`/schedule?season=${seasonYear}`}
            className={`${NAV_LINK} text-accent-gold hover:brightness-110`}
          >
            Full season schedule
          </Link>
        </nav>
      </PageSection>

      <section className="pb-8 md:pb-12 space-y-4">
        {matchups.map((matchup, index) => {
          const rivalryName =
            findNamedRivalry(
              rivalryLookup,
              matchup.homeTeam.franchiseId,
              matchup.awayTeam.franchiseId,
            )?.name ?? null;
          return (
          <ScrollReveal key={matchup.matchupId} delay={index * 40}>
            <Link
              href={`/matchups/${seasonYear}/${week}/${matchup.matchupId}`}
              className="block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              aria-label={`${matchup.homeTeam.franchiseName} versus ${matchup.awayTeam.franchiseName}${rivalryName ? `, ${rivalryName}` : ""}, view detail`}
            >
              <MatchupRow
                matchup={{
                  homeTeam: matchup.homeTeam,
                  awayTeam: matchup.awayTeam,
                  homeScore: matchup.homeTeam.points,
                  awayScore: matchup.awayTeam.points,
                  status: matchup.status,
                  matchupId: matchup.matchupId,
                }}
                variant={getVariant(matchup.status)}
                rivalryName={rivalryName}
              />
            </Link>
          </ScrollReveal>
          );
        })}

        {/* Live score polling -- renders only during game windows */}
        <ScorePoller initialIsGameWindow={hasLiveMatchups} />
      </section>
    </>
  );
}
