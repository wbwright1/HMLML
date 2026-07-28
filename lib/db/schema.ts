import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  real,
  bigint,
  jsonb,
  timestamp,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// seasons
// ---------------------------------------------------------------------------
export const seasons = pgTable(
  "seasons",
  {
    id: serial("id").primaryKey(),
    seasonYear: integer("season_year").notNull().unique(),
    leagueId: text("league_id").notNull(),
    previousLeagueId: text("previous_league_id"),
    status: text("status"), // 'complete' | 'in_season' | 'pre_draft'
    championFranchiseId: text("champion_franchise_id"),
    totalRosters: integer("total_rosters"),
    playoffWeekStart: integer("playoff_week_start"),
    settingsJson: jsonb("settings_json"),
    // Division metadata for the season. Nullable: legacy/pre-division seasons
    // have no divisions at all. divisionNames shape: {"1":"Division 1", ...}.
    divisionCount: integer("division_count"),
    divisionNames: jsonb("division_names"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_seasons_status").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// franchises
// ---------------------------------------------------------------------------
export const franchises = pgTable(
  "franchises",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    abbreviation: text("abbreviation"), // 2-3 letter, for logo fallback
    brandingColor: text("branding_color"), // hex color
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// franchise_seasons
// ---------------------------------------------------------------------------
export const franchiseSeasons = pgTable(
  "franchise_seasons",
  {
    id: serial("id").primaryKey(),
    franchiseId: text("franchise_id")
      .notNull()
      .references(() => franchises.id),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    rosterId: text("roster_id").notNull(),
    userId: text("user_id").notNull(),
    ownerDisplayName: text("owner_display_name"),
    coOwnerDisplayName: text("co_owner_display_name"),
    // Per-season team avatar (Sleeper team branding). Nullable: not every user
    // sets one, and legacy seasons have none. Versioned here (not on
    // franchises) so a franchise's crest can change year to year, matching the
    // versioned-identity model.
    avatarUrl: text("avatar_url"),
    // Division assignment for this franchise in this season. Nullable:
    // legacy/pre-division seasons and the predecessor league have none.
    division: integer("division"),
    divisionName: text("division_name"),
    wins: integer("wins").default(0),
    losses: integer("losses").default(0),
    ties: integer("ties").default(0),
    pointsScored: real("points_scored").default(0),
    pointsAgainst: real("points_against").default(0),
    standingsFinish: integer("standings_finish"),
    playoffResult: text("playoff_result"), // 'champion' | 'runner_up' | 'made_playoffs' | 'consolation' | 'toilet_bowl' | null. 'toilet_bowl' = either participant of the losers-bracket final (both finalists carry it; not unique per season); 'consolation' = any other losers-bracket team.
    isLegacyEra: boolean("is_legacy_era").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_franchise_seasons_franchise_season").on(
      table.franchiseId,
      table.seasonId,
    ),
    index("idx_franchise_seasons_franchise_id").on(table.franchiseId),
    index("idx_franchise_seasons_season_id").on(table.seasonId),
    index("idx_franchise_seasons_season_division").on(
      table.seasonId,
      table.division,
    ),
  ],
);

// ---------------------------------------------------------------------------
// members
// ---------------------------------------------------------------------------
// A league member (person), keyed by their stable Sleeper user_id. Seeded and
// kept fresh by the daily sync from the current-season owners and co-owners.
// Members are never deleted: someone who leaves the league keeps their smack
// posts attributed. franchiseId is the franchise they currently control (null
// when unattached). claimCodeHash/codeGeneratedAt are set only when the commish
// generates a claim code; role gates commish tooling. Neither role nor the
// claim code is ever touched by sync.
export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    sleeperUserId: text("sleeper_user_id").notNull().unique(),
    displayName: text("display_name").notNull(),
    franchiseId: text("franchise_id").references(() => franchises.id),
    role: text("role").notNull().default("member"), // 'member' | 'commish'
    claimCodeHash: text("claim_code_hash"),
    codeGeneratedAt: timestamp("code_generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// member_sessions
// ---------------------------------------------------------------------------
// A logged-in session for a member. Only the SHA-256 hash of the opaque bearer
// token is stored; the plaintext lives solely in the member's cookie. A session
// is valid while now < expiresAt and revokedAt is null.
export const memberSessions = pgTable(
  "member_sessions",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_member_sessions_member_id").on(table.memberId),
  ],
);

// ---------------------------------------------------------------------------
// smack_posts
// ---------------------------------------------------------------------------
// Member-authored trash talk, attributed to the franchise the member controlled
// when they posted. Distinct from hub_content 'smack_post' rows, which are the
// auto-generated Site Desk voice. hidden lets the commish moderate without
// destroying attribution/history.
export const smackPosts = pgTable(
  "smack_posts",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    franchiseId: text("franchise_id")
      .notNull()
      .references(() => franchises.id),
    body: text("body").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_smack_posts_hidden_created").on(table.hidden, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// matchups
// ---------------------------------------------------------------------------
export const matchups = pgTable(
  "matchups",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    week: integer("week").notNull(),
    matchupId: integer("matchup_id").notNull(), // Sleeper matchup pairing ID
    franchiseId: text("franchise_id")
      .notNull()
      .references(() => franchises.id),
    rosterId: text("roster_id").notNull(),
    points: real("points").default(0),
    isWinner: boolean("is_winner"),
    isPlayoff: boolean("is_playoff").default(false),
    status: text("status").default("scheduled"), // 'scheduled' | 'in_progress' | 'complete'
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_matchups_season_week_roster").on(
      table.seasonId,
      table.week,
      table.rosterId,
    ),
    index("idx_matchups_season_week").on(table.seasonId, table.week),
    index("idx_matchups_franchise_id").on(table.franchiseId),
    index("idx_matchups_season_status").on(table.seasonId, table.status),
  ],
);

// ---------------------------------------------------------------------------
// players
// ---------------------------------------------------------------------------
export const players = pgTable(
  "players",
  {
    id: text("id").primaryKey(), // Sleeper player_id
    fullName: text("full_name"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    position: text("position"),
    nflTeam: text("nfl_team"),
    status: text("status"), // Active, Injured Reserve, etc.
    injuryStatus: text("injury_status"),
    age: integer("age"),
    yearsExp: integer("years_exp"),
    searchFullName: text("search_full_name"), // lowercase, for search
    pointsPpr: real("points_ppr"), // season fantasy points (PPR scoring)
    statsSeason: integer("stats_season"), // which season the points are from (e.g. 2025)
    // Upcoming-season projected fantasy points, league-scored: the daily sync
    // weights Sleeper's raw projection stat line by this league's own scoring
    // settings (not Sleeper's full-PPR pts_ppr). Powers preseason
    // roster-strength projections. The column name is a deliberate misnomer
    // kept to avoid a rename migration; the value is no longer raw PPR.
    // Nullable: not fetched until the daily sync's projection step runs, and
    // some players (rookies pre-draft, etc.) never get a projection.
    projPointsPpr: real("proj_points_ppr"),
    projSeason: integer("proj_season"), // which season the projection is for (e.g. 2026)
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("idx_players_search").on(table.searchFullName),
    index("idx_players_position").on(table.position),
  ],
);

// ---------------------------------------------------------------------------
// draft_picks
// ---------------------------------------------------------------------------
export const draftPicks = pgTable(
  "draft_picks",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    draftId: text("draft_id").notNull(), // Sleeper draft ID
    draftType: text("draft_type").notNull(), // 'startup' | 'rookie'
    round: integer("round").notNull(),
    pickNumber: integer("pick_number").notNull(),
    rosterId: text("roster_id"),
    franchiseId: text("franchise_id").references(() => franchises.id),
    playerId: text("player_id").references(() => players.id),
    playerName: text("player_name"), // snapshot at draft time
    originalFranchiseId: text("original_franchise_id").references(() => franchises.id), // franchise that originally held the pick slot (null = same as franchiseId, or unknown)
    isLegacyEra: boolean("is_legacy_era").default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_draft_picks_season_id").on(table.seasonId),
  ],
);

// ---------------------------------------------------------------------------
// transactions
// ---------------------------------------------------------------------------
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    transactionId: text("transaction_id").notNull().unique(),
    type: text("type").notNull(), // 'trade' | 'waiver' | 'free_agent' | 'commissioner'
    status: text("status"),
    week: integer("week"),
    rosterIds: jsonb("roster_ids"), // array of involved roster_ids
    adds: jsonb("adds"),
    drops: jsonb("drops"),
    draftPicksInvolved: jsonb("draft_picks_involved"),
    createdAtSleeper: bigint("created_at_sleeper", { mode: "number" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_transactions_season_id").on(table.seasonId),
    index("idx_transactions_created_at_sleeper").on(table.createdAtSleeper),
  ],
);

// ---------------------------------------------------------------------------
// roster_players
// ---------------------------------------------------------------------------
export const rosterPlayers = pgTable(
  "roster_players",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    franchiseId: text("franchise_id")
      .notNull()
      .references(() => franchises.id),
    rosterId: text("roster_id").notNull(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id),
    slot: text("slot"), // 'starter' | 'bench' | 'ir' | 'taxi'
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("uq_roster_players_season_roster_player").on(
      table.seasonId,
      table.rosterId,
      table.playerId,
    ),
    index("idx_roster_players_season_franchise").on(
      table.seasonId,
      table.franchiseId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// player_week_points
// ---------------------------------------------------------------------------
// Per-player, per-week fantasy scoring for a roster in a matchup. Powers
// lineup tables, win probability, players-left counts, and PROJ columns.
// No FK to players: historical players may be missing from the players
// snapshot, so queries left-join instead.
export const playerWeekPoints = pgTable(
  "player_week_points",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    week: integer("week").notNull(),
    rosterId: text("roster_id").notNull(),
    franchiseId: text("franchise_id")
      .notNull()
      .references(() => franchises.id),
    matchupId: integer("matchup_id"), // Sleeper pairing ID, nullable
    playerId: text("player_id").notNull(), // NO FK — historical players may be absent
    points: real("points").notNull().default(0),
    projectedPoints: real("projected_points"),
    slot: text("slot"), // 'QB' | 'RB' | 'WR' | 'TE' | 'FLEX' | 'SUPER_FLEX' | 'K' | 'DEF' | ... | 'BN'
    started: boolean("started").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_player_week_points_season_week_roster_player").on(
      table.seasonId,
      table.week,
      table.rosterId,
      table.playerId,
    ),
    index("idx_player_week_points_season_week").on(
      table.seasonId,
      table.week,
    ),
    index("idx_player_week_points_player_id").on(table.playerId),
  ],
);

// ---------------------------------------------------------------------------
// player_week_stats
// ---------------------------------------------------------------------------
// Per-player, per-week NFL box-score stats (passing/rushing/receiving/kicking),
// keyed by (season, week, player) and NOT roster-scoped: these are league-
// neutral facts about a player's real NFL game, distinct from
// player_week_points which is per-roster fantasy scoring. Powers player-profile
// stat lines. A curated set of typed columns covers the common stat questions;
// the full Sleeper stat map (including pts_ppr and every advanced metric) is
// kept verbatim in the stats jsonb catch-all so nothing is lost. No FK to
// players (historical players may be absent from the daily snapshot), matching
// player_week_points.
export const playerWeekStats = pgTable(
  "player_week_stats",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    week: integer("week").notNull(),
    playerId: text("player_id").notNull(), // NO FK — historical players may be absent
    position: text("position"),
    gamesPlayed: integer("games_played"),
    // Curated stat columns (real, nullable — a stat absent for a player/week is
    // null, not zero). Sourced from the Sleeper stat map keys of the same name.
    passYd: real("pass_yd"),
    passTd: real("pass_td"),
    passInt: real("pass_int"),
    passAtt: real("pass_att"),
    passCmp: real("pass_cmp"),
    rushYd: real("rush_yd"),
    rushTd: real("rush_td"),
    rushAtt: real("rush_att"),
    rec: real("rec"),
    recYd: real("rec_yd"),
    recTd: real("rec_td"),
    recTgt: real("rec_tgt"),
    fumLost: real("fum_lost"),
    fgm: real("fgm"),
    fga: real("fga"),
    xpm: real("xpm"),
    // Full Sleeper stat map for this player/week, verbatim (pts_ppr, advanced
    // metrics, everything). The curated columns above are extracted from here.
    stats: jsonb("stats"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_player_week_stats_season_week_player").on(
      table.seasonId,
      table.week,
      table.playerId,
    ),
    index("idx_player_week_stats_player_id").on(table.playerId),
    index("idx_player_week_stats_season_week").on(table.seasonId, table.week),
  ],
);

// ---------------------------------------------------------------------------
// nfl_games
// ---------------------------------------------------------------------------
// NFL schedule rows from Sleeper's schedule endpoint, keyed by game_id. Powers
// per-starter "yet to play" classification: a starter's nfl_team joins here
// through home_team/away_team to read the game's real status.
export const nflGames = pgTable(
  "nfl_games",
  {
    id: serial("id").primaryKey(),
    gameId: text("game_id").notNull().unique(),
    seasonYear: integer("season_year").notNull(),
    week: integer("week").notNull(),
    gameDate: text("game_date"),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    status: text("status").notNull(), // 'pre_game' | 'complete' | 'canceled' | in-game value
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_nfl_games_season_week").on(table.seasonYear, table.week),
  ],
);

// ---------------------------------------------------------------------------
// hub_content
// ---------------------------------------------------------------------------
// DB-backed editorial content for the seasonally-aware hub (division notes,
// burning questions, bold predictions, offseason receipts, matchup angles,
// game-of-week + hero deks, and Site Desk smack posts). Written by the weekly
// generate-content cron (LLM or deterministic template fallback) and read by
// getHubEditorial(), which overlays these rows onto the seeded defaults per
// kind. week is null for season-scoped content (preseason/offseason); ref_key
// carries a division name, matchupPairKey, or franchise slug depending on kind.
export const hubContent = pgTable(
  "hub_content",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    week: integer("week"), // null = season-scoped
    kind: text("kind").notNull(), // 'division_note' | 'burning_question' | 'bold_prediction' | 'offseason_receipt' | 'matchup_angle' | 'game_of_week_blurb' | 'hero_dek' | 'smack_post'
    refKey: text("ref_key"), // division name, matchupPairKey, or franchise slug
    body: text("body").notNull(),
    extras: jsonb("extras"), // kicker/verdict/category/position fields per kind
    status: text("status").notNull().default("published"), // 'draft' | 'published'
    generatedBy: text("generated_by").notNull(), // 'auto' | 'commish'
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_hub_content_season_week_kind").on(
      table.seasonId,
      table.week,
      table.kind,
    ),
  ],
);

// ---------------------------------------------------------------------------
// league_awards
// ---------------------------------------------------------------------------
// Commissioner-decided season honors: Regular Season MVP, Championship MVP
// ("Finals MVP"), and Rookie of the Year. Keyed on seasonId (FK) so legacy /
// predecessor seasons can carry honors too. playerId is nullable with NO FK
// (snapshot pattern shared with player_week_points / draft_picks): historical
// winners may be absent from the daily players snapshot, so playerName (+
// position) are snapshotted here and queries left-join players only for the
// photo. franchiseId is the roster that held the winner that season. These
// awards deliberately do NOT feed the GOAT Index; they are player honors, not
// franchise-score inputs. One winner per (season, award) via the unique index.
export const leagueAwards = pgTable(
  "league_awards",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    awardType: text("award_type").notNull(), // 'regular_season_mvp' | 'championship_mvp' | 'rookie_of_year'
    playerId: text("player_id"), // NO FK — historical winners may be absent from the players snapshot
    playerName: text("player_name").notNull(), // snapshot at award time
    position: text("position"), // snapshot
    franchiseId: text("franchise_id").references(() => franchises.id),
    note: text("note"), // optional one-line lore
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_league_awards_season_type").on(
      table.seasonId,
      table.awardType,
    ),
    index("idx_league_awards_player_id").on(table.playerId),
    index("idx_league_awards_franchise_id").on(table.franchiseId),
    index("idx_league_awards_award_type").on(table.awardType),
  ],
);

// ---------------------------------------------------------------------------
// player_values
// ---------------------------------------------------------------------------
// Dynasty trade-value snapshots for players and draft picks, sourced from
// FantasyCalc (daily sync) and backfilled historically from DynastyProcess CSV
// snapshots. assetId is either a Sleeper player_id or a FantasyCalc pick
// pseudo-id (e.g. "FP_2026_1"); there is deliberately NO foreign key to
// players, since pick pseudo-ids don't resolve there. Values never feed trade
// grades; they power a separate "value-then-vs-now" display on trade cards.
export const playerValues = pgTable(
  "player_values",
  {
    id: serial("id").primaryKey(),
    assetId: text("asset_id").notNull(),
    position: text("position"),
    name: text("name"),
    value: real("value").notNull(),
    overallRank: integer("overall_rank"),
    positionRank: integer("position_rank"),
    trend30Day: real("trend_30day"),
    redraftValue: real("redraft_value"),
    tier: integer("tier"),
    source: text("source").notNull(), // 'fantasycalc' | 'dynastyprocess'
    snapshotDate: date("snapshot_date").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_player_values_asset_date_source").on(
      table.assetId,
      table.snapshotDate,
      table.source,
    ),
    index("idx_player_values_asset_date").on(table.assetId, table.snapshotDate),
    index("idx_player_values_snapshot_date").on(table.snapshotDate),
  ],
);

// ---------------------------------------------------------------------------
// sync_log
// ---------------------------------------------------------------------------
export const syncLog = pgTable(
  "sync_log",
  {
    id: serial("id").primaryKey(),
    syncType: text("sync_type").notNull(), // 'daily' | 'hourly' | 'legacy_import'
    status: text("status").notNull(), // 'success' | 'partial' | 'failure'
    dataType: text("data_type"), // 'players' | 'league' | 'rosters' | 'matchups' | 'transactions' | 'drafts'
    rowCount: integer("row_count").default(0),
    durationMs: integer("duration_ms"),
    errorMessage: text("error_message"),
    detailsJson: jsonb("details_json"),
    startedAt: timestamp("started_at").defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_sync_log_type_started").on(table.syncType, table.startedAt),
  ],
);

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;

export type Franchise = typeof franchises.$inferSelect;
export type NewFranchise = typeof franchises.$inferInsert;

export type FranchiseSeason = typeof franchiseSeasons.$inferSelect;
export type NewFranchiseSeason = typeof franchiseSeasons.$inferInsert;

export type Matchup = typeof matchups.$inferSelect;
export type NewMatchup = typeof matchups.$inferInsert;

export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;

export type DraftPick = typeof draftPicks.$inferSelect;
export type NewDraftPick = typeof draftPicks.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type RosterPlayer = typeof rosterPlayers.$inferSelect;
export type NewRosterPlayer = typeof rosterPlayers.$inferInsert;

export type PlayerWeekPoints = typeof playerWeekPoints.$inferSelect;
export type NewPlayerWeekPoints = typeof playerWeekPoints.$inferInsert;

export type PlayerWeekStats = typeof playerWeekStats.$inferSelect;
export type NewPlayerWeekStats = typeof playerWeekStats.$inferInsert;

export type NflGame = typeof nflGames.$inferSelect;
export type NewNflGame = typeof nflGames.$inferInsert;

export type SyncLogEntry = typeof syncLog.$inferSelect;
export type NewSyncLogEntry = typeof syncLog.$inferInsert;

export type HubContent = typeof hubContent.$inferSelect;
export type NewHubContent = typeof hubContent.$inferInsert;

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export type MemberSession = typeof memberSessions.$inferSelect;
export type NewMemberSession = typeof memberSessions.$inferInsert;

export type SmackPostRow = typeof smackPosts.$inferSelect;
export type NewSmackPostRow = typeof smackPosts.$inferInsert;

export type LeagueAward = typeof leagueAwards.$inferSelect;
export type NewLeagueAward = typeof leagueAwards.$inferInsert;

export type PlayerValue = typeof playerValues.$inferSelect;
export type NewPlayerValue = typeof playerValues.$inferInsert;
