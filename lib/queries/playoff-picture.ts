import { getSeasonStandings } from "@/lib/queries/seasons";
import { getPlayoffProjection, type ProjectedTeam } from "@/lib/queries/divisions";
import { computeStandingsRaceTags, type PlayoffRaceTag } from "@/lib/queries/playoff-race";
import { buildDraftWatch, showPlayoffPicture } from "@/lib/hub/playoff-picture";

export interface PlayoffPictureTeam {
  franchiseId: string;
  slug: string;
  name: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  ties: number;
}

export interface PlayoffPictureFieldRow extends PlayoffPictureTeam {
  seed: number;
  isDivisionWinner: boolean;
  tag: PlayoffRaceTag | null;
}

export interface PlayoffPictureDraftRow extends PlayoffPictureTeam {
  pick: number;
  maxPointsFor: number | null;
  tag: PlayoffRaceTag | null;
}

export interface PlayoffPicture {
  field: PlayoffPictureFieldRow[];
  firstOut: (PlayoffPictureTeam & { tag: PlayoffRaceTag | null }) | null;
  draftWatch: PlayoffPictureDraftRow[];
  bracketPicks: { from: number; to: number } | null;
}

function teamOf(t: ProjectedTeam): PlayoffPictureTeam {
  return {
    franchiseId: t.franchiseId,
    slug: t.slug,
    name: t.name,
    abbreviation: t.abbreviation ?? null,
    brandingColor: t.brandingColor ?? null,
    avatarUrl: t.avatarUrl ?? null,
    wins: t.wins,
    losses: t.losses,
    ties: t.ties,
  };
}

/**
 * The midseason hub's "Playoff picture": the projected playoff field (with
 * the provably-correct race tags) and the rookie draft order if the season
 * ended today. Null before week 8, after the regular season, or when there is
 * no projected field to show. DB errors propagate to the caller's
 * rethrowUnlessTolerable guard.
 */
export async function getPlayoffPicture(
  seasonId: number,
  week: number,
  playoffWeekStart: number | null | undefined,
): Promise<PlayoffPicture | null> {
  if (!showPlayoffPicture(week, playoffWeekStart)) return null;

  const [standings, projection] = await Promise.all([
    getSeasonStandings(seasonId),
    getPlayoffProjection(seasonId),
  ]);
  const field = projection.field.filter((t) => t.isIn && t.seed != null);
  if (standings.length === 0 || field.length === 0) return null;

  const raceTags = computeStandingsRaceTags(standings, { week, playoffWeekStart });
  const tagOf = (id: string) => raceTags.get(id) ?? null;

  const watch = buildDraftWatch(
    standings.map((s) => ({
      franchiseId: s.franchiseId,
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      maxPointsFor: s.maxPointsFor ?? null,
    })),
    field.map((t) => t.franchiseId),
  );
  const standingById = new Map(standings.map((s) => [s.franchiseId, s]));

  return {
    field: [...field]
      .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99))
      .map((t) => ({
        ...teamOf(t),
        seed: t.seed as number,
        isDivisionWinner: t.isDivisionWinner,
        tag: tagOf(t.franchiseId),
      })),
    firstOut: projection.firstOut
      ? { ...teamOf(projection.firstOut), tag: tagOf(projection.firstOut.franchiseId) }
      : null,
    draftWatch: watch.entries.flatMap((e) => {
      const s = standingById.get(e.franchiseId);
      if (!s) return [];
      return [
        {
          franchiseId: s.franchiseId,
          slug: s.franchiseSlug,
          name: s.franchiseName,
          abbreviation: s.franchiseAbbreviation ?? null,
          brandingColor: s.franchiseBrandingColor ?? null,
          avatarUrl: s.avatarUrl ?? null,
          wins: s.wins ?? 0,
          losses: s.losses ?? 0,
          ties: s.ties ?? 0,
          pick: e.pick,
          maxPointsFor: e.maxPointsFor,
          tag: tagOf(s.franchiseId),
        },
      ];
    }),
    bracketPicks: watch.bracketPicks,
  };
}
