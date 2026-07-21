ALTER TABLE "franchise_seasons" ADD COLUMN "division" integer;--> statement-breakpoint
ALTER TABLE "franchise_seasons" ADD COLUMN "division_name" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "division_count" integer;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "division_names" jsonb;--> statement-breakpoint
CREATE INDEX "idx_franchise_seasons_season_division" ON "franchise_seasons" USING btree ("season_id","division");