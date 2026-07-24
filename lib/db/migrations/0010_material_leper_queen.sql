CREATE TABLE "league_awards" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"award_type" text NOT NULL,
	"player_id" text,
	"player_name" text NOT NULL,
	"position" text,
	"franchise_id" text,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "league_awards" ADD CONSTRAINT "league_awards_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_awards" ADD CONSTRAINT "league_awards_franchise_id_franchises_id_fk" FOREIGN KEY ("franchise_id") REFERENCES "public"."franchises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_league_awards_season_type" ON "league_awards" USING btree ("season_id","award_type");--> statement-breakpoint
CREATE INDEX "idx_league_awards_player_id" ON "league_awards" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "idx_league_awards_franchise_id" ON "league_awards" USING btree ("franchise_id");--> statement-breakpoint
CREATE INDEX "idx_league_awards_award_type" ON "league_awards" USING btree ("award_type");