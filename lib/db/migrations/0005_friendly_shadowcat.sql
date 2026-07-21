CREATE TABLE "nfl_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"season_year" integer NOT NULL,
	"week" integer NOT NULL,
	"game_date" text,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nfl_games_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
CREATE INDEX "idx_nfl_games_season_week" ON "nfl_games" USING btree ("season_year","week");