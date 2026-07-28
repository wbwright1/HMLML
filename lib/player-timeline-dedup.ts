import type { TimelineEvent } from "@/lib/queries/player-profile";

/**
 * Removes "stint" events that merely restate an explicit acquisition already
 * on the timeline. A stint begins the season a player first appears on a
 * franchise's roster, so a drafted / waiver_add / trade-in acquisition in that
 * same franchise+season produces a redundant "Rostered by ..." block. We drop
 * the stint and keep the acquisition event.
 *
 * Stints with NO coinciding acquisition are kept: they explain ownership that
 * nothing else on the timeline accounts for (e.g. legacy pre-Sleeper presence).
 *
 * Consecutive drafts (2021 startup kept through a 2023 redraft) survive intact:
 * only stints are ever removed, never drafts, so the timeline reads draft > draft.
 */
export function dedupeTimelineStints(events: TimelineEvent[]): TimelineEvent[] {
  const acquisitionKeys = new Set<string>();
  for (const e of events) {
    if ((e.type === "drafted" || e.type === "waiver_add") && e.franchise) {
      acquisitionKeys.add(`${e.franchise.id}:${e.seasonYear}`);
    } else if (e.type === "traded" && e.tradeToFranchise) {
      // Only the gaining side of a trade is an acquisition.
      acquisitionKeys.add(`${e.tradeToFranchise.id}:${e.seasonYear}`);
    }
  }
  return events.filter((e) => {
    if (e.type !== "stint" || !e.franchise) return true;
    // stint.seasonYear IS firstSeasonYear (see getPlayerTimeline).
    return !acquisitionKeys.has(`${e.franchise.id}:${e.seasonYear}`);
  });
}
