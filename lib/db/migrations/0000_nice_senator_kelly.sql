CREATE TABLE "draft_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"draft_id" text NOT NULL,
	"draft_type" text NOT NULL,
	"round" integer NOT NULL,
	"pick_number" integer NOT NULL,
	"roster_id" text,
	"franchise_id" text,
	"player_id" text,
	"player_name" text,
	"is_legacy_era" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "franchise_seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"franchise_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"roster_id" text NOT NULL,
	"user_id" text NOT NULL,
	"owner_display_name" text,
	"wins" integer DEFAULT 0,
	"losses" integer DEFAULT 0,
	"ties" integer DEFAULT 0,
	"points_scored" real DEFAULT 0,
	"points_against" real DEFAULT 0,
	"standings_finish" integer,
	"playoff_result" text,
	"is_legacy_era" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "franchises" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text,
	"branding_color" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "franchises_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "matchups" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"week" integer NOT NULL,
	"matchup_id" integer NOT NULL,
	"franchise_id" text NOT NULL,
	"roster_id" text NOT NULL,
	"points" real DEFAULT 0,
	"is_winner" boolean,
	"is_playoff" boolean DEFAULT false,
	"status" text DEFAULT 'scheduled',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text,
	"first_name" text,
	"last_name" text,
	"position" text,
	"nfl_team" text,
	"status" text,
	"injury_status" text,
	"age" integer,
	"years_exp" integer,
	"search_full_name" text,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "roster_players" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"franchise_id" text NOT NULL,
	"roster_id" text NOT NULL,
	"player_id" text NOT NULL,
	"slot" text,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_year" integer NOT NULL,
	"league_id" text NOT NULL,
	"previous_league_id" text,
	"status" text,
	"champion_franchise_id" text,
	"total_rosters" integer,
	"playoff_week_start" integer,
	"settings_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "seasons_season_year_unique" UNIQUE("season_year")
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_type" text NOT NULL,
	"status" text NOT NULL,
	"data_type" text,
	"row_count" integer DEFAULT 0,
	"duration_ms" integer,
	"error_message" text,
	"details_json" jsonb,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"transaction_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text,
	"week" integer,
	"roster_ids" jsonb,
	"adds" jsonb,
	"drops" jsonb,
	"draft_picks_involved" jsonb,
	"created_at_sleeper" bigint,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "transactions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_seasons" ADD CONSTRAINT "franchise_seasons_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_seasons" ADD CONSTRAINT "franchise_seasons_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_players" ADD CONSTRAINT "roster_players_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_players" ADD CONSTRAINT "roster_players_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_players" ADD CONSTRAINT "roster_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_draft_picks_season_id" ON "draft_picks" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_franchise_seasons_franchise_season" ON "franchise_seasons" USING btree ("franchise_id","season_id");--> statement-breakpoint
CREATE INDEX "idx_franchise_seasons_franchise_id" ON "franchise_seasons" USING btree ("franchise_id");--> statement-breakpoint
CREATE INDEX "idx_franchise_seasons_season_id" ON "franchise_seasons" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_matchups_season_week_roster" ON "matchups" USING btree ("season_id","week","roster_id");--> statement-breakpoint
CREATE INDEX "idx_matchups_season_week" ON "matchups" USING btree ("season_id","week");--> statement-breakpoint
CREATE INDEX "idx_matchups_franchise_id" ON "matchups" USING btree ("franchise_id");--> statement-breakpoint
CREATE INDEX "idx_players_search" ON "players" USING btree ("search_full_name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_roster_players_season_roster_player" ON "roster_players" USING btree ("season_id","roster_id","player_id");--> statement-breakpoint
CREATE INDEX "idx_roster_players_season_franchise" ON "roster_players" USING btree ("season_id","franchise_id");--> statement-breakpoint
CREATE INDEX "idx_sync_log_type_started" ON "sync_log" USING btree ("sync_type","started_at");