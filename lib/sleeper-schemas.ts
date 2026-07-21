import { z } from "zod";

// ─── League ──────────────────────────────────────────────────────────────────

export const SleeperLeagueSchema = z
  .object({
    league_id: z.string(),
    name: z.string(),
    season: z.string(),
    status: z.string(), // pre_draft | drafting | in_season | complete
    previous_league_id: z.string().nullable(),
    total_rosters: z.number(),
    settings: z.record(z.string(), z.unknown()),
    roster_positions: z.array(z.string()),
    scoring_settings: z.record(z.string(), z.number()),
    // Division names, when set, live at metadata.division_N keys (unset in
    // this league; divisions default to "Division N" via resolveDivisionName).
    // Values are typed unknown, NOT string: Sleeper does not guarantee every
    // metadata value is a string, and a stricter schema would hard-fail the
    // whole league parse (and thus daily + hourly sync) over a cosmetic
    // field. resolveDivisionName string-guards before use.
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();

export type SleeperLeague = z.infer<typeof SleeperLeagueSchema>;

// ─── User ────────────────────────────────────────────────────────────────────

export const SleeperUserSchema = z
  .object({
    user_id: z.string(),
    display_name: z.string(),
    avatar: z.string().nullable(),
    metadata: z
      .object({
        team_name: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type SleeperUser = z.infer<typeof SleeperUserSchema>;

// ─── Roster ──────────────────────────────────────────────────────────────────

export const SleeperRosterSchema = z
  .object({
    roster_id: z.number(),
    owner_id: z.string().nullable(),
    co_owners: z.array(z.string()).nullable().optional(),
    league_id: z.string(),
    players: z.array(z.string()).nullable(),
    starters: z.array(z.string()).nullable(),
    reserve: z.array(z.string()).nullable(), // IR
    taxi: z.array(z.string()).nullable(),
    settings: z
      .object({
        wins: z.number().optional(),
        losses: z.number().optional(),
        ties: z.number().optional(),
        fpts: z.number().optional(),
        fpts_decimal: z.number().optional(),
        fpts_against: z.number().optional(),
        fpts_against_decimal: z.number().optional(),
        division: z.number().optional(),
      })
      .passthrough(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();

export type SleeperRoster = z.infer<typeof SleeperRosterSchema>;

// ─── Matchup ─────────────────────────────────────────────────────────────────

export const SleeperMatchupSchema = z
  .object({
    roster_id: z.number(),
    matchup_id: z.number().nullable(),
    points: z.number().nullable().optional(),
    players: z.array(z.string()).nullable(),
    starters: z.array(z.string()).nullable(),
    starters_points: z.array(z.number()).nullable(),
    players_points: z.record(z.string(), z.number()).nullable().optional(),
  })
  .passthrough();

export type SleeperMatchup = z.infer<typeof SleeperMatchupSchema>;

// ─── Draft ───────────────────────────────────────────────────────────────────

export const SleeperDraftSchema = z
  .object({
    draft_id: z.string(),
    league_id: z.string(),
    season: z.string(),
    type: z.string(), // snake | linear
    status: z.string(), // pre_draft | drafting | complete
    settings: z.record(z.string(), z.unknown()),
    draft_order: z.record(z.string(), z.number()).nullable(),
  })
  .passthrough();

export type SleeperDraft = z.infer<typeof SleeperDraftSchema>;

// ─── Draft Pick ──────────────────────────────────────────────────────────────

export const SleeperDraftPickSchema = z
  .object({
    round: z.number(),
    pick_no: z.number(),
    roster_id: z.number(),
    player_id: z.string(),
    metadata: z
      .object({
        first_name: z.string().nullable().optional(),
        last_name: z.string().nullable().optional(),
        position: z.string().nullable().optional(),
        team: z.string().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type SleeperDraftPick = z.infer<typeof SleeperDraftPickSchema>;

// ─── Transaction ─────────────────────────────────────────────────────────────

export const SleeperTransactionDraftPickSchema = z
  .object({
    season: z.string(),
    round: z.number(),
    roster_id: z.number(),
    previous_owner_id: z.number(),
    owner_id: z.number(),
  })
  .passthrough();

export const SleeperTransactionSchema = z
  .object({
    transaction_id: z.string(),
    type: z.string(), // trade | waiver | free_agent | commissioner
    status: z.string(), // complete | failed
    roster_ids: z.array(z.number()),
    adds: z.record(z.string(), z.number()).nullable(),
    drops: z.record(z.string(), z.number()).nullable(),
    draft_picks: z.array(SleeperTransactionDraftPickSchema).nullable(),
    created: z.number(),
    week: z.number().nullable().optional(),
  })
  .passthrough();

export type SleeperTransaction = z.infer<typeof SleeperTransactionSchema>;

// ─── Traded Pick ─────────────────────────────────────────────────────────────

export const SleeperTradedPickSchema = z
  .object({
    season: z.string(),
    round: z.number(),
    roster_id: z.number(),
    previous_owner_id: z.number(),
    owner_id: z.number(),
  })
  .passthrough();

export type SleeperTradedPick = z.infer<typeof SleeperTradedPickSchema>;

// ─── NFL State ───────────────────────────────────────────────────────────────

export const SleeperNFLStateSchema = z
  .object({
    season: z.string(),
    season_type: z.string(), // pre | regular | post | off
    week: z.number(),
    display_week: z.number(),
    leg: z.number(),
  })
  .passthrough();

export type SleeperNFLState = z.infer<typeof SleeperNFLStateSchema>;

// ─── Bracket Match ───────────────────────────────────────────────────────────

export const SleeperBracketMatchSchema = z
  .object({
    m: z.number(), // match number
    r: z.number(), // round number
    p: z.number().optional(), // placement position (1 = champion match, etc.)
    w: z.number().nullable().optional(), // winning roster_id
    l: z.number().nullable().optional(), // losing roster_id
    t1: z.union([z.number(), z.object({}).passthrough()]).nullable().optional(), // team 1 roster_id (or object ref)
    t2: z.union([z.number(), z.object({}).passthrough()]).nullable().optional(), // team 2 roster_id (or object ref)
  })
  .passthrough();

export type SleeperBracketMatch = z.infer<typeof SleeperBracketMatchSchema>;

// ─── Player ──────────────────────────────────────────────────────────────────

export const SleeperPlayerSchema = z
  .object({
    player_id: z.string(),
    full_name: z.string().nullable().optional(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    position: z.string().nullable().optional(),
    team: z.string().nullable().optional(), // NFL team abbreviation
    status: z.string().nullable().optional(),
    injury_status: z.string().nullable().optional(),
    age: z.number().nullable().optional(),
    years_exp: z.number().nullable().optional(),
    search_full_name: z.string().nullable().optional(),
  })
  .passthrough();

export type SleeperPlayer = z.infer<typeof SleeperPlayerSchema>;

// ─── Player Stats ───────────────────────────────────────────────────────────

export const SleeperPlayerStatsSchema = z.record(
  z.string(), // player_id
  z.object({
    pts_ppr: z.number().optional(),
    pts_half_ppr: z.number().optional(),
    pts_std: z.number().optional(),
    gp: z.number().optional(),
  }).passthrough()
);
export type SleeperPlayerStats = z.infer<typeof SleeperPlayerStatsSchema>;

// ─── Projections ──────────────────────────────────────────────────────────────
// Keyed by player_id; each value is a stat map (pass_yd, rush_td, pts_ppr, etc.).
// Some stat values can be null, so inner values are nullable.
export const SleeperProjectionsSchema = z.record(
  z.string(), // player_id
  z.record(z.string(), z.number().nullable())
);
export type SleeperProjections = z.infer<typeof SleeperProjectionsSchema>;

// ─── Schedule Game ────────────────────────────────────────────────────────────
// From api.sleeper.app/schedule/nfl/{seasonType}/{season} (NOT under /v1).
// status is left permissive (plain string): observed "pre_game", "complete",
// "canceled", plus an in-game value during live windows.
export const SleeperScheduleGameSchema = z
  .object({
    game_id: z.string(),
    week: z.number(),
    date: z.string().nullable().optional(),
    home: z.string(),
    away: z.string(),
    status: z.string(),
  })
  .passthrough();

export type SleeperScheduleGame = z.infer<typeof SleeperScheduleGameSchema>;

// ─── Trending Add ─────────────────────────────────────────────────────────────

export const SleeperTrendingAddSchema = z.array(
  z.object({
    player_id: z.string(),
    count: z.number(),
  }).passthrough()
);
export type SleeperTrendingAdd = z.infer<typeof SleeperTrendingAddSchema>[number];
