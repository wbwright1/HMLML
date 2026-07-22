CREATE TABLE "hub_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"season_id" integer NOT NULL,
	"week" integer,
	"kind" text NOT NULL,
	"ref_key" text,
	"body" text NOT NULL,
	"extras" jsonb,
	"status" text DEFAULT 'published' NOT NULL,
	"generated_by" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "hub_content" ADD CONSTRAINT "hub_content_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hub_content_season_week_kind" ON "hub_content" USING btree ("season_id","week","kind");