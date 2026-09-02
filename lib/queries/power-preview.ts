import {
  getPowerRankingsView,
  type PowerRankingsView,
} from "@/lib/queries/preseason-power";

// ---------------------------------------------------------------------------
// Hub Power Rankings preview (#277)
// ---------------------------------------------------------------------------
//
// Thin reduction layer over getPowerRankingsView(); issues no new DB queries
// of its own. buildPowerPreview is pure and DB-free so it can be unit tested
// directly against hand-built PowerRankingsView fixtures.

export interface PowerPreviewRow {
  rank: number;
  id: string;
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl: string | null;
  /** Regular mode: "6-2" style record. Preseason: null. */
  record: string | null;
  /** Regular: standingsRank - rank (positive = climbing). Preseason: null. */
  formDelta: number | null;
  /** Preseason: powerScore * 100, one decimal. Regular: null. */
  powerIndex: string | null;
}

export interface PowerPreviewMover {
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl: string | null;
  delta: number; // always > 0; direction implied by riser vs faller
  standingsRank: number;
}

export interface HubPowerPreview {
  mode: "regular" | "preseason";
  top: PowerPreviewRow[];
  riser: PowerPreviewMover | null;
  faller: PowerPreviewMover | null;
  windowGames: number; // 0 in preseason mode
}

/**
 * Pure; unit-testable without a DB. Returns null when there is not enough
 * signal for an honest preview: fewer than 3 entries, or a regular-mode view
 * where every entry has windowGames === 0 (getPowerRankings is defensive but
 * would otherwise emit all-zero scores).
 */
export function buildPowerPreview(
  view: PowerRankingsView,
  topN = 4
): HubPowerPreview | null {
  if (view.entries.length < 3) return null;

  if (view.mode === "preseason") {
    const top: PowerPreviewRow[] = view.entries.slice(0, topN).map((e) => ({
      rank: e.rank,
      id: e.id,
      slug: e.slug,
      name: e.name,
      abbreviation: e.abbreviation,
      brandingColor: e.brandingColor,
      avatarUrl: e.avatarUrl,
      record: null,
      formDelta: null,
      powerIndex: (e.powerScore * 100).toFixed(1),
    }));
    return {
      mode: "preseason",
      top,
      riser: null,
      faller: null,
      windowGames: 0,
    };
  }

  const totalWindowGames = view.entries.reduce(
    (sum, e) => sum + (e.windowGames ?? 0),
    0
  );
  if (totalWindowGames === 0) return null;

  const sorted = [...view.entries].sort((a, b) => a.rank - b.rank);
  const top: PowerPreviewRow[] = sorted.slice(0, topN).map((e) => ({
    rank: e.rank,
    id: e.id,
    slug: e.slug,
    name: e.name,
    abbreviation: e.abbreviation,
    brandingColor: e.brandingColor,
    avatarUrl: e.avatarUrl,
    record: `${e.wins}-${e.losses}${e.ties > 0 ? `-${e.ties}` : ""}`,
    formDelta: e.formDelta,
    powerIndex: null,
  }));

  // Riser = largest positive formDelta; faller = largest negative. Ties break
  // to the better (lower) power rank.
  let riser: PowerPreviewMover | null = null;
  let riserRank = Number.POSITIVE_INFINITY;
  let faller: PowerPreviewMover | null = null;
  let fallerRank = Number.POSITIVE_INFINITY;

  for (const e of sorted) {
    if (e.formDelta > 0) {
      const better =
        !riser || e.formDelta > riser.delta || (e.formDelta === riser.delta && e.rank < riserRank);
      if (better) {
        riser = {
          slug: e.slug,
          name: e.name,
          abbreviation: e.abbreviation,
          brandingColor: e.brandingColor,
          avatarUrl: e.avatarUrl,
          delta: e.formDelta,
          standingsRank: e.standingsRank,
        };
        riserRank = e.rank;
      }
    } else if (e.formDelta < 0) {
      const absDelta = Math.abs(e.formDelta);
      const better =
        !faller || absDelta > faller.delta || (absDelta === faller.delta && e.rank < fallerRank);
      if (better) {
        faller = {
          slug: e.slug,
          name: e.name,
          abbreviation: e.abbreviation,
          brandingColor: e.brandingColor,
          avatarUrl: e.avatarUrl,
          delta: absDelta,
          standingsRank: e.standingsRank,
        };
        fallerRank = e.rank;
      }
    }
  }

  return {
    mode: "regular",
    top,
    riser,
    faller,
    windowGames: totalWindowGames,
  };
}

export async function getHubPowerPreview(topN = 4): Promise<HubPowerPreview | null> {
  const view = await getPowerRankingsView();
  return buildPowerPreview(view, topN);
}
