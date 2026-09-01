import type { NflSeasonType } from "@/lib/queries/nfl-state";
import type { StatsContext } from "@/lib/content-gen/stats-context";

// ---------------------------------------------------------------------------
// Season phase
// ---------------------------------------------------------------------------
// The league calendar carved into six editorial phases. seasonType alone is
// too coarse for the LLM prompt: "regular" covers everything from Week 1
// (records mean nothing) through Week 17 (the title game), and "pre" content
// was being written as if games had already been played (claimed division
// winners at 0-0, title defenses by teams that never won one). Each phase
// carries its own prompt guidance block so generated copy matches where the
// season actually is.

export type SeasonPhase =
  | "preseason"
  | "early_season"
  | "mid_season"
  | "late_season"
  | "playoffs"
  | "offseason";

/** Fantasy playoffs + toilet bowl run over NFL regular-season weeks 15-17. */
const EARLY_SEASON_END = 4;
const MID_SEASON_END = 8;
const LATE_SEASON_END = 14;

/**
 * Maps the NFL season type + week to the league's editorial phase. "regular"
 * subdivides by week (early 1-4, mid 5-8, late 9-14, playoffs/toilet bowl
 * 15-17); "post" and "off" are both the offseason lull between the title game
 * and next year's draft.
 */
export function resolveSeasonPhase(seasonType: NflSeasonType, week: number): SeasonPhase {
  if (seasonType === "pre") return "preseason";
  if (seasonType === "post" || seasonType === "off") return "offseason";
  if (week <= EARLY_SEASON_END) return "early_season";
  if (week <= MID_SEASON_END) return "mid_season";
  if (week <= LATE_SEASON_END) return "late_season";
  return "playoffs";
}

/**
 * The reigning-champion fact block shared by the phases where last season is
 * the only completed season worth citing. Names the ONE franchise allowed to
 * carry "defending champion" framing, or bans the framing entirely when the
 * context has no champion on file.
 */
function championClause(ctx: StatsContext): string {
  const champ = ctx.lastSeason?.champion;
  if (champ) {
    return `The reigning champion is ${champ.name} (won the ${ctx.lastSeason?.year} title at ${champ.record}). ONLY ${champ.name} may be described as defending a title, chasing a repeat, or having a championship to protect. Never frame any other franchise as a champion, title defender, or repeat contender.`;
  }
  return `The STATS JSON names no reigning champion. Do NOT describe ANY franchise as defending a title, chasing a repeat, or being the champion.`;
}

/**
 * A compact good-vs-rejected example pair for a phase. "Example Team" is a
 * deliberate placeholder: the closing line orders the model to substitute
 * real names, and the downstream name-hallucination guard drops any row that
 * parrots the placeholder.
 */
function exampleBlock(good: string, bad: string, why: string): string {
  return `- EXAMPLE that fits the phase: ${good}
- EXAMPLE that gets REJECTED: ${bad} Rejected because ${why}
- These examples use the placeholder "Example Team" to show shape and framing only. ALWAYS write about real franchises and players from the STATS JSON, never the placeholder.`;
}

/**
 * Phase-specific guidance appended to the LLM user prompt. This is guidance,
 * not a script: it steers what framings are truthful in this part of the
 * calendar (and explicitly bans the ones that are not) without dictating the
 * copy itself. Pure; unit-tested.
 */
export function phaseGuidance(phase: SeasonPhase, ctx: StatsContext): string {
  const header = `SEASON PHASE: ${phase.toUpperCase().replace("_", " ")}. Everything you write must fit this point in the league calendar. Follow these framing rules exactly:`;

  switch (phase) {
    case "preseason":
      return `${header}
- NOT ONE GAME of the ${ctx.seasonYear} season has been played. Every team is 0-0. Any 0-0 record in the STATS JSON is a placeholder, not a result.
- NEVER claim a team has won, currently leads, or has clinched a division, a playoff spot, or anything else this season. There are no standings yet, no streaks yet, no results yet.
- ${championClause(ctx)}
- Write forward-looking: predictions, projections, burning questions, offseason receipts, roster debates. Past results are fair game ONLY when explicitly attributed to a prior season ("last year", "in ${ctx.lastSeason?.year ?? "a prior season"}").
- Good angles: draft-pick and trade verdicts, projection hype and skepticism, last season's receipts, multi-year trends, who is due for regression or a leap.
${exampleBlock(
  `"Example Team spent three picks on wide receivers after finishing bottom-three in scoring last year. Either the rebuild starts hitting in September or the group chat gets a new punching bag."`,
  `"Example Team leads its division and its new quarterback has them eyeing a title defense."`,
  `no games have been played (nobody leads anything), and a title defense belongs only to the named reigning champion.`,
)}`;

    case "early_season":
      return `${header}
- The season is ${ctx.week <= 1 ? "just underway" : `only ${ctx.week - 1} week(s) old`}. Records are a tiny sample.
- NEVER declare a division winner, a playoff lock, or a lost season. Nobody has clinched or been eliminated from anything.
- ${championClause(ctx)}
- Good angles: hot starts vs slow starts, preseason expectations meeting reality, overreaction bait framed AS overreaction, early statement wins, 0-X panic watch.${
        ctx.week <= 1
          ? `
- WEEK 1 SPECIFICALLY: nobody has a record at all. Every angle must hang on all-time head-to-head, last season, a past playoff meeting, the title rematch, or a projection. A current-season record ("0-0", "unbeaten", "still winless") is a fabrication this week. Two teams with no head-to-head history have a FIRST meeting; say so and leave it there.`
          : ""
      }
${
        ctx.week <= 1
          ? exampleBlock(
              `"Example Team has taken the last three from Other Team, all by double digits. The rematch tour opens right where it left off."`,
              `"Example Team is 0-0 and Other Team is 0-0, so somebody's number finally moves."`,
              `a 0-0 record is not a fact about a team; it is the absence of one. Week 1 angles come from head-to-head history, last season, or a projection.`,
            )
          : exampleBlock(
              `"Example Team is 2-0 and already talking like it is December. Two weeks of football has cured nobody's delusions before."`,
              `"Example Team has locked up its division and can start resting starters."`,
              `nothing is clinched this early; a 2-0 start is a hot start, not a decided race.`,
            )
      }`;

    case "mid_season":
      return `${header}
- The season is at its midpoint (week ${ctx.week}). Trends are real now, but nothing is decided.
- Do NOT claim any team has clinched a division or playoff spot, or been mathematically eliminated, unless the STATS JSON says so explicitly.
- ${championClause(ctx)}
- Good angles: contenders vs pretenders, division races tightening or breaking open, trade-deadline posture (buyers, sellers, delusional holders), first-half receipts against preseason talk.
${exampleBlock(
  `"Example Team at 5-2 keeps winning ugly. Contender or pretender gets settled in the second half, but the record is banking wins either way."`,
  `"Example Team is champion of its division at the halfway mark."`,
  `nobody is champion of anything at the midpoint; frame it as a race being led, not a title being held.`,
)}`;

    case "late_season":
      return `${header}
- It is week ${ctx.week}: the stretch run. The playoff race is the story.
- Frame stakes as the race they are: seeding, must-win weeks, tiebreakers, teams playing spoiler, doormats limping to the finish. Only state that a team has clinched or been eliminated if the STATS JSON supports it; otherwise use race framing ("in the driver's seat", "on life support").
- ${championClause(ctx)}
- Good angles: desperation games, collapses in progress, seeding implications, season-long receipts coming due.
${exampleBlock(
  `"Example Team at 8-4 controls its own seeding, and its last three opponents all need the win more. The stretch run is where comfortable teams get uncomfortable."`,
  `"Example Team has clinched the one seed and cruises into the bracket."`,
  `the STATS JSON does not state a clinch; use race framing ("in the driver's seat") unless the data says it outright.`,
)}`;

    case "playoffs":
      return `${header}
- It is week ${ctx.week}: the playoffs and the toilet bowl. The regular season is OVER and its records are final.
- Do NOT frame the playoff race as ongoing; the field is set. Frame matchups as elimination stakes: win or go home, title path, consolation-bracket shame.
- ${championClause(ctx)} A NEW champion is not crowned until the final is done; do not declare one.
- Good angles: bracket runs, upset watch, the toilet bowl as a public shaming, season-long receipts settled on the field.
${exampleBlock(
  `"Example Team backed into the bracket at 7-7 and now gets the No. 1 seed in round one. Win and the whole regular season is forgiven; lose and it never happened."`,
  `"Example Team is still fighting for a playoff spot this week."`,
  `the field is set; there is no playoff race in the playoffs, only elimination.`,
)}`;

    case "offseason":
      return `${header}
- The ${ctx.seasonYear} season is over. There are no games, no matchups, no live standings. Do not write about upcoming weekly matchups.
- ${championClause(ctx)}
- Frame everything as recap or lookahead: how the season ended, who owes the group chat an apology, rebuild vs reload posture, draft positioning, offseason moves.
${exampleBlock(
  `"Example Team's season ended in the toilet bowl and the draft board is its only friend now. Rebuild talk starts in the group chat approximately immediately."`,
  `"Example Team looks strong heading into this week's matchup."`,
  `there are no matchups in the offseason; everything is recap or lookahead.`,
)}`;
  }
}
