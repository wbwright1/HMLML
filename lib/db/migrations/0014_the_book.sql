CREATE TABLE "book_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"week" integer NOT NULL,
	"matchup_id" integer NOT NULL,
	"home_roster_id" text NOT NULL,
	"away_roster_id" text NOT NULL,
	"spread" real NOT NULL,
	"ml_home" integer NOT NULL,
	"ml_away" integer NOT NULL,
	"home_projected" real,
	"away_projected" real,
	"priced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"week" integer NOT NULL,
	"matchup_id" integer NOT NULL,
	"side" text NOT NULL,
	"spread_at_pick" real NOT NULL,
	"ml_at_pick" integer NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_prop_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"prop_id" integer NOT NULL,
	"side" text NOT NULL,
	"odds_at_pick" integer NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_props" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"week" integer NOT NULL,
	"kind" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text,
	"question" text NOT NULL,
	"line" real NOT NULL,
	"over_odds" integer NOT NULL,
	"under_odds" integer NOT NULL,
	"snark" text,
	"result" text,
	"actual_value" real,
	"graded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_lines" ADD CONSTRAINT "book_lines_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_picks" ADD CONSTRAINT "book_picks_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_picks" ADD CONSTRAINT "book_picks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_prop_picks" ADD CONSTRAINT "book_prop_picks_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_prop_picks" ADD CONSTRAINT "book_prop_picks_prop_id_book_props_id_fk" FOREIGN KEY ("prop_id") REFERENCES "public"."book_props"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_props" ADD CONSTRAINT "book_props_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_book_lines_season_week_matchup" ON "book_lines" USING btree ("season_id","week","matchup_id");--> statement-breakpoint
CREATE INDEX "idx_book_lines_season_week" ON "book_lines" USING btree ("season_id","week");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_book_picks_member_season_week_matchup" ON "book_picks" USING btree ("member_id","season_id","week","matchup_id");--> statement-breakpoint
CREATE INDEX "idx_book_picks_season_week" ON "book_picks" USING btree ("season_id","week");--> statement-breakpoint
CREATE INDEX "idx_book_picks_member" ON "book_picks" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_book_prop_picks_member_prop" ON "book_prop_picks" USING btree ("member_id","prop_id");--> statement-breakpoint
CREATE INDEX "idx_book_prop_picks_prop" ON "book_prop_picks" USING btree ("prop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_book_props_season_week_kind_subject" ON "book_props" USING btree ("season_id","week","kind","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "idx_book_props_season_week" ON "book_props" USING btree ("season_id","week");