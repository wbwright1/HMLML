CREATE TABLE "player_week_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"week" integer NOT NULL,
	"player_id" text NOT NULL,
	"position" text,
	"games_played" integer,
	"pass_yd" real,
	"pass_td" real,
	"pass_int" real,
	"pass_att" real,
	"pass_cmp" real,
	"rush_yd" real,
	"rush_td" real,
	"rush_att" real,
	"rec" real,
	"rec_yd" real,
	"rec_td" real,
	"rec_tgt" real,
	"fum_lost" real,
	"fgm" real,
	"fga" real,
	"xpm" real,
	"stats" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD CONSTRAINT "player_week_stats_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_player_week_stats_season_week_player" ON "player_week_stats" USING btree ("season_id","week","player_id");--> statement-breakpoint
CREATE INDEX "idx_player_week_stats_player_id" ON "player_week_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_player_week_stats_season_week" ON "player_week_stats" USING btree ("season_id","week");