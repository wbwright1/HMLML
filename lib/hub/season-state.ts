import type { NflSeasonType } from "@/lib/queries/nfl-state";

/**
 * Mirrors app/page.tsx's hub-state routing (the nflSeasonType/dbSeasonStatus
 * mapping, plus the pre-Week-1 "nothing played yet" override) so the topbar
 * live pill and the hub body always agree on which state is showing.
 */
export function resolveHubSeasonType({
  nflSeasonType,
  dbSeasonStatus,
  hasLiveMatchups,
  nothingPlayedYet,
  weekOneLeadWindow,
}: {
  nflSeasonType: NflSeasonType | null;
  dbSeasonStatus: string | null;
  hasLiveMatchups: boolean;
  nothingPlayedYet: boolean;
  /**
   * True from 7 days before the earliest week-1 game onward (KICKOFF_LEAD_DAYS,
   * or forced via the preview NFL_STATE_OVERRIDE). Suppresses the "everyone's
   * 0-0" demotion so
   * kickoff week shows the regular-season hub, not the preseason one.
   * Source: isWeekOneLeadWindowActive (lib/queries/nfl-state.ts).
   */
  weekOneLeadWindow: boolean;
}): NflSeasonType {
  let seasonType: NflSeasonType;
  if (nflSeasonType === "regular") {
    seasonType = "regular";
  } else if (nflSeasonType === "post") {
    seasonType = "post";
  } else if (nflSeasonType === "pre") {
    seasonType = "pre";
  } else if (dbSeasonStatus === "in_season") {
    seasonType = "regular";
  } else if (
    dbSeasonStatus === "pre_draft" ||
    dbSeasonStatus === "drafting" ||
    dbSeasonStatus === "complete"
  ) {
    seasonType = "pre";
  } else {
    seasonType = "off";
  }

  if (seasonType === "regular" && !hasLiveMatchups && nothingPlayedYet && !weekOneLeadWindow) {
    seasonType = "pre";
  }

  return seasonType;
}

const SEASON_TYPE_BADGE_LABEL: Record<NflSeasonType, string> = {
  pre: "Preseason",
  regular: "In Season",
  post: "Playoffs",
  off: "Offseason",
};

/**
 * Maps a resolved hub season type to the label shown on the season badge
 * (history timeline, /seasons list) for the current/latest season. Sharing
 * this with resolveHubSeasonType's output is what keeps the badge and the
 * hub banner from disagreeing (e.g. banner says PRESEASON while an older
 * "In Season" badge, read straight off the raw DB status, said otherwise).
 */
export function seasonTypeBadgeLabel(seasonType: NflSeasonType): string {
  return SEASON_TYPE_BADGE_LABEL[seasonType];
}

/**
 * Pre-Week-1 detection (issue #17): a live season where every team is still
 * 0-0-0. Feeds resolveHubSeasonType's "nothing played yet" override so the hub
 * and the topbar pill agree. Single source of the derivation, used by both
 * app/page.tsx and components/site-nav.tsx (previously duplicated inline).
 * Empty standings return false (an unsynced season is not "pre-Week-1").
 */
export function isPreWeekOne(
  standings: Array<{ wins: number | null; losses: number | null; ties: number | null }>
): boolean {
  return (
    standings.length > 0 &&
    standings.every(
      (s) => (s.wins ?? 0) === 0 && (s.losses ?? 0) === 0 && (s.ties ?? 0) === 0
    )
  );
}
