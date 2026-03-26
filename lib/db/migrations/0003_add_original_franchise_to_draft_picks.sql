ALTER TABLE "draft_picks" ADD COLUMN "original_franchise_id" text REFERENCES "franchises"("id");
