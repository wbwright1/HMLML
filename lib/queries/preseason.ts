import { db } from "@/lib/db";
import {
  franchises,
  franchiseSeasons,
  seasons,
  players,
  rosterPlayers,
  draftPicks,
} from "@/lib/db/schema";
import { eq, desc, asc, and, sql } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TeamAward {
  label: string;
  stat: string;
  context: string;
  franchiseName: string;
  franchiseSlug: string;
  tone: "positive" | "sting" | "neutral";
}

export interface PlayerAward {
  category: string;
  playerName: string;
  franchiseName: string;
  stat: string;
  position: string;
}

export interface StingStat {
  label: string;
  franchiseName: string;
  franchiseSlug: string;
  context: string;
  stat: string;
}

export interface DraftOrderEntry {
  rank: number;
  franchiseName: string;
  record: string;
}

export interface PreseasonAwards {
  teamAwards: TeamAward[];
  playerAwards: PlayerAward[];
  stingStats: StingStat[];
  draftOrder: DraftOrderEntry[];
}

// ─── Main Query ─────────────────────────────────────────────────────────────

/**
 * Returns preseason awards data for the hub: team awards, player awards,
 * sting stats, and draft order. All based on the previous completed season.
 */
export async function getPreseasonAwards(
  seasonId: number
): Promise<PreseasonAwards | null> {
  try {
    // Get all franchise seasons for the given season, joined with franchise info
    const seasonStandings = await db
      .select({
        franchiseId: franchiseSeasons.franchiseId,
        franchiseName: franchises.name,
        franchiseSlug: franchises.slug,
        wins: franchiseSeasons.wins,
        losses: franchiseSeasons.losses,
        ties: franchiseSeasons.ties,
        pointsScored: franchiseSeasons.pointsScored,
        pointsAgainst: franchiseSeasons.pointsAgainst,
        standingsFinish: franchiseSeasons.standingsFinish,
        playoffResult: franchiseSeasons.playoffResult,
      })
      .from(franchiseSeasons)
      .innerJoin(franchises, eq(franchiseSeasons.franchiseId, franchises.id))
      .where(eq(franchiseSeasons.seasonId, seasonId));

    if (seasonStandings.length === 0) {
      return null;
    }

    // ── Team Awards ───────────────────────────────────────────────────────

    const teamAwards: TeamAward[] = [];

    // Most Points For
    const sortedByPF = [...seasonStandings].sort(
      (a, b) => (b.pointsScored ?? 0) - (a.pointsScored ?? 0)
    );
    if (sortedByPF[0]) {
      const t = sortedByPF[0];
      teamAwards.push({
        label: "Point Machine",
        stat: `${(t.pointsScored ?? 0).toFixed(1)} PF`,
        context: "Most points scored in the league",
        franchiseName: t.franchiseName,
        franchiseSlug: t.franchiseSlug,
        tone: "positive",
      });
    }

    // Least Points Against (Iron Curtain)
    const sortedByPA = [...seasonStandings].sort(
      (a, b) => (a.pointsAgainst ?? 0) - (b.pointsAgainst ?? 0)
    );
    if (sortedByPA[0]) {
      const t = sortedByPA[0];
      teamAwards.push({
        label: "Iron Curtain",
        stat: `${(t.pointsAgainst ?? 0).toFixed(1)} PA`,
        context: "Fewest points scored against",
        franchiseName: t.franchiseName,
        franchiseSlug: t.franchiseSlug,
        tone: "positive",
      });
    }

    // Best Record
    const sortedByRecord = [...seasonStandings].sort((a, b) => {
      const aWinPct =
        (a.wins ?? 0) / Math.max((a.wins ?? 0) + (a.losses ?? 0) + (a.ties ?? 0), 1);
      const bWinPct =
        (b.wins ?? 0) / Math.max((b.wins ?? 0) + (b.losses ?? 0) + (b.ties ?? 0), 1);
      return bWinPct - aWinPct;
    });
    if (sortedByRecord[0]) {
      const t = sortedByRecord[0];
      const record = `${t.wins ?? 0}-${t.losses ?? 0}${(t.ties ?? 0) > 0 ? `-${t.ties}` : ""}`;
      teamAwards.push({
        label: "Regular Season King",
        stat: record,
        context: "Best regular season record",
        franchiseName: t.franchiseName,
        franchiseSlug: t.franchiseSlug,
        tone: "positive",
      });
    }

    // ── Player Awards (top scorer by position) ──────────────────────────

    const playerAwards: PlayerAward[] = [];

    // Get the season year for the player stats query
    const [seasonRow] = await db
      .select({ seasonYear: seasons.seasonYear })
      .from(seasons)
      .where(eq(seasons.id, seasonId))
      .limit(1);

    if (seasonRow) {
      const positions = ["QB", "RB", "WR", "TE"] as const;

      for (const pos of positions) {
        const topPlayer = await db
          .select({
            playerName: players.fullName,
            position: players.position,
            pointsPpr: players.pointsPpr,
            franchiseName: franchises.name,
          })
          .from(rosterPlayers)
          .innerJoin(players, eq(rosterPlayers.playerId, players.id))
          .innerJoin(
            franchises,
            eq(rosterPlayers.franchiseId, franchises.id)
          )
          .where(
            and(
              eq(rosterPlayers.seasonId, seasonId),
              eq(players.position, pos),
              eq(players.statsSeason, seasonRow.seasonYear)
            )
          )
          .orderBy(desc(players.pointsPpr))
          .limit(1);

        if (topPlayer[0] && topPlayer[0].pointsPpr != null) {
          playerAwards.push({
            category: `BEST ${pos}`,
            playerName: topPlayer[0].playerName ?? "Unknown",
            franchiseName: topPlayer[0].franchiseName,
            stat: `${topPlayer[0].pointsPpr.toFixed(1)} pts`,
            position: pos,
          });
        }
      }
    }

    // ── Sting Stats ─────────────────────────────────────────────────────

    const stingStats: StingStat[] = [];

    // Worst Record (League Doormat)
    const worstRecord = sortedByRecord[sortedByRecord.length - 1];
    if (worstRecord) {
      const record = `${worstRecord.wins ?? 0}-${worstRecord.losses ?? 0}${(worstRecord.ties ?? 0) > 0 ? `-${worstRecord.ties}` : ""}`;
      stingStats.push({
        label: "League Doormat",
        franchiseName: worstRecord.franchiseName,
        franchiseSlug: worstRecord.franchiseSlug,
        context: "Worst regular season record",
        stat: record,
      });
    }

    // Glass Cannon (high PF + low wins, bottom half of standings)
    const medianWins =
      [...seasonStandings]
        .map((s) => s.wins ?? 0)
        .sort((a, b) => a - b)[Math.floor(seasonStandings.length / 2)] ?? 0;

    const glassCannons = seasonStandings
      .filter((s) => (s.wins ?? 0) <= medianWins && (s.pointsScored ?? 0) > 0)
      .sort((a, b) => (b.pointsScored ?? 0) - (a.pointsScored ?? 0));

    if (glassCannons[0]) {
      const t = glassCannons[0];
      const record = `${t.wins ?? 0}-${t.losses ?? 0}${(t.ties ?? 0) > 0 ? `-${t.ties}` : ""}`;
      stingStats.push({
        label: "Glass Cannon",
        franchiseName: t.franchiseName,
        franchiseSlug: t.franchiseSlug,
        context: `${(t.pointsScored ?? 0).toFixed(1)} PF but only ${record}`,
        stat: `${(t.pointsScored ?? 0).toFixed(1)} PF`,
      });
    }

    // Paper Tiger (most PA)
    const sortedByMostPA = [...seasonStandings].sort(
      (a, b) => (b.pointsAgainst ?? 0) - (a.pointsAgainst ?? 0)
    );
    if (sortedByMostPA[0]) {
      const t = sortedByMostPA[0];
      stingStats.push({
        label: "Punching Bag",
        franchiseName: t.franchiseName,
        franchiseSlug: t.franchiseSlug,
        context: "Most points scored against; the league's favorite target",
        stat: `${(t.pointsAgainst ?? 0).toFixed(1)} PA`,
      });
    }

    // ── Draft Order ─────────────────────────────────────────────────────

    // Draft order is inverse of standings finish (worst first)
    const draftOrder: DraftOrderEntry[] = [...seasonStandings]
      .sort((a, b) => {
        // Non-playoff teams sorted by reverse standings (worst record picks first)
        // Playoff teams pick last
        const aPlayoff = a.playoffResult != null && a.playoffResult !== "consolation" && a.playoffResult !== "toilet_bowl";
        const bPlayoff = b.playoffResult != null && b.playoffResult !== "consolation" && b.playoffResult !== "toilet_bowl";

        if (aPlayoff !== bPlayoff) return aPlayoff ? 1 : -1;

        // Among same group, sort by standings finish descending (worst first)
        return (b.standingsFinish ?? 99) - (a.standingsFinish ?? 99);
      })
      .map((t, i) => ({
        rank: i + 1,
        franchiseName: t.franchiseName,
        record: `${t.wins ?? 0}-${t.losses ?? 0}${(t.ties ?? 0) > 0 ? `-${t.ties}` : ""}`,
      }));

    return {
      teamAwards,
      playerAwards,
      stingStats,
      draftOrder,
    };
  } catch (error) {
    console.error("[preseason] Failed to fetch preseason awards:", error);
    return null;
  }
}
