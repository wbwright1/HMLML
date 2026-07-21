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
    wins: integer("wins").default(0),
    losses: integer("losses").default(0),
    ties: integer("ties").default(0),
    pointsScored: real("points_scored").default(0),
    pointsAgainst: real("points_against").default(0),
    standingsFinish: integer("standings_finish"),
    playoffResult: text("playoff_result"), // 'champion' | 'runner_up' | 'made_playoffs' | 'consolation' | 'toilet_bowl' | null
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

export type SyncLogEntry = typeof syncLog.$inferSelect;
export type NewSyncLogEntry = typeof syncLog.$inferInsert;
