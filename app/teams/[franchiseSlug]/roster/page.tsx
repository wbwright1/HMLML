import { notFound } from "next/navigation";
import Link from "next/link";
import { PageSection } from "@/components/page-section";
import { ScrollReveal } from "@/components/scroll-reveal";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { MobileTableView } from "@/components/mobile-table-view";
import { PositionBadge } from "@/components/position-badge";
import {
  getFranchiseBySlug,
  getFranchiseRoster,
} from "@/lib/queries/franchises";

interface RosterPageProps {
  params: Promise<{ franchiseSlug: string }>;
}

export async function generateMetadata({ params }: RosterPageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;
  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    return { title: "Roster Not Found | Harambe Memorial League Memorial League" };
  }

  return {
    title: `${franchise.name} Roster | Harambe Memorial League Memorial League`,
    description: `Current roster for ${franchise.name} in the Harambe Memorial League Memorial League.`,
  };
}

// Position display order for sorting
const positionOrder: Record<string, number> = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 4,
  K: 5,
  DEF: 6,
};

function getPositionSort(position: string | null): number {
  return positionOrder[position ?? ""] ?? 99;
}

// Slot display labels and sort order
const slotLabels: Record<string, string> = {
  starter: "Starters",
  bench: "Bench",
  ir: "Injured Reserve",
  taxi: "Taxi Squad",
};

const slotOrder: Record<string, number> = {
  starter: 1,
  bench: 2,
  taxi: 3,
  ir: 4,
};

function getPlayerName(player: {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    player.fullName ??
    (`${player.firstName ?? ""} ${player.lastName ?? ""}`.trim() ||
    "Unknown")
  );
}

type RosterPlayer = NonNullable<
  Awaited<ReturnType<typeof getFranchiseRoster>>
>[number];

export default async function RosterPage({ params }: RosterPageProps) {
  const { franchiseSlug } = await params;

  let franchise: Awaited<ReturnType<typeof getFranchiseBySlug>> = null;

  try {
    franchise = await getFranchiseBySlug(franchiseSlug);
  } catch {
    // DB may not be connected in dev
  }

  if (!franchise) {
    notFound();
  }

  // Use the most recent season to fetch the roster
  const latestSeason = franchise.seasonHistory[0];

  let roster: Awaited<ReturnType<typeof getFranchiseRoster>> = null;

  if (latestSeason) {
    try {
      roster = await getFranchiseRoster(franchise.id, latestSeason.seasonId);
    } catch {
      // Roster data may not be available
    }
  }

  // Group roster by slot, sorted within each group by position
  const groupedRoster = new Map<string, RosterPlayer[]>();
  if (roster) {
    const sorted = [...roster].sort(
      (a, b) => getPositionSort(a.position) - getPositionSort(b.position)
    );

    for (const player of sorted) {
      const slot = player.slot ?? "bench";
      if (!groupedRoster.has(slot)) {
        groupedRoster.set(slot, []);
      }
      groupedRoster.get(slot)!.push(player);
    }
  }

  // Sort slot groups by priority
  const slotGroups = [...groupedRoster.entries()].sort(
    ([a], [b]) => (slotOrder[a] ?? 5) - (slotOrder[b] ?? 5)
  );

  // Determine championship count for identity display
  const championships = franchise.seasonHistory.filter(
    (s) => s.playoffResult === "champion"
  ).length;

  const seasonYear = latestSeason?.seasonYear;

  return (
    <>
      <section className="py-24 space-y-8">
        <Link
          href={`/teams/${franchise.slug}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; {franchise.name}
        </Link>

        <ScrollReveal>
          <FranchiseIdentity
            franchise={{
              slug: franchise.slug,
              name: franchise.name,
              abbreviation: franchise.abbreviation,
              brandingColor: franchise.brandingColor,
            }}
            championships={championships}
            variant="hero"
          />
        </ScrollReveal>
      </section>

      <PageSection
        label={seasonYear ? `${seasonYear} Season` : "Current Season"}
        title="Roster"
      >
        {slotGroups.length === 0 ? (
          <p className="text-body-lg text-muted-foreground">
            No roster data available yet. Check back once rosters have been
            synced from Sleeper.
          </p>
        ) : (
          <div className="space-y-10">
            {slotGroups.map(([slot, players], groupIndex) => (
              <ScrollReveal key={slot} delay={groupIndex * 80}>
                <div className="space-y-4">
                  <h3 className="text-h3">
                    {slotLabels[slot] ?? slot}
                    <span className="ml-2 text-body-sm text-muted-foreground font-normal">
                      ({players.length})
                    </span>
                  </h3>

                  <MobileTableView
                    headers={["Player", "Pos", "Team", "Status"]}
                    keyColumns={[0, 1, 2]}
                    rows={players.map((player) => [
                      <span key="name" className="font-medium">
                        {getPlayerName(player)}
                      </span>,
                      <PositionBadge key="pos" position={player.position} />,
                      player.nflTeam ?? "FA",
                      player.injuryStatus ? (
                        <span
                          key="status"
                          className="text-xs text-destructive"
                        >
                          {player.injuryStatus}
                        </span>
                      ) : (
                        <span
                          key="status"
                          className="text-xs text-muted-foreground"
                        >
                          {player.status ?? "-"}
                        </span>
                      ),
                    ])}
                  />
                </div>
              </ScrollReveal>
            ))}
          </div>
        )}
      </PageSection>
    </>
  );
}
