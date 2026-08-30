CREATE TABLE "book_future_picks" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"market" text NOT NULL,
	"subject_id" text NOT NULL,
	"odds_at_pick" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_futures" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"market" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"prob" real NOT NULL,
	"odds" integer NOT NULL,
	"detail" jsonb,
	"priced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"graded_result" text,
	"graded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "book_future_picks" ADD CONSTRAINT "book_future_picks_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_future_picks" ADD CONSTRAINT "book_future_picks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_futures" ADD CONSTRAINT "book_futures_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_book_future_picks_member_season_market" ON "book_future_picks" USING btree ("member_id","season_id","market");--> statement-breakpoint
CREATE INDEX "idx_book_future_picks_season_market" ON "book_future_picks" USING btree ("season_id","market");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_book_futures_season_market_subject" ON "book_futures" USING btree ("season_id","market","subject_id");--> statement-breakpoint
CREATE INDEX "idx_book_futures_season_market" ON "book_futures" USING btree ("season_id","market");