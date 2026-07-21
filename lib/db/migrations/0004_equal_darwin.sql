CREATE TABLE "player_week_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"week" integer NOT NULL,
	"roster_id" text NOT NULL,
	"franchise_id" text NOT NULL,
	"matchup_id" integer,
	"player_id" text NOT NULL,
	"points" real DEFAULT 0 NOT NULL,
	"projected_points" real,
	"slot" text,
	"started" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "player_week_points" ADD CONSTRAINT "player_week_points_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_week_points" ADD CONSTRAINT "player_week_points_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_player_week_points_season_week_roster_player" ON "player_week_points" USING btree ("season_id","week","roster_id","player_id");--> statement-breakpoint
CREATE INDEX "idx_player_week_points_season_week" ON "player_week_points" USING btree ("season_id","week");--> statement-breakpoint
CREATE INDEX "idx_player_week_points_player_id" ON "player_week_points" USING btree ("player_id");
