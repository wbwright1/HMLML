CREATE TABLE "playoff_bracket_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"bracket_type" text NOT NULL,
	"round" integer NOT NULL,
	"match_number" integer NOT NULL,
	"placement" integer,
	"team1_roster_id" integer,
	"team2_roster_id" integer,
	"team1_from_match" integer,
	"team2_from_match" integer,
	"advancing_roster_id" integer,
	"eliminated_roster_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "toilet_bowl_franchise_id" text;--> statement-breakpoint
ALTER TABLE "playoff_bracket_matches" ADD CONSTRAINT "playoff_bracket_matches_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_playoff_bracket_matches_season_id" ON "playoff_bracket_matches" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_playoff_bracket_matches_unique" ON "playoff_bracket_matches" USING btree ("season_id","bracket_type","match_number");