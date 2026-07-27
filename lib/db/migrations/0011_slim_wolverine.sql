CREATE TABLE "player_values" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"position" text,
	"name" text,
	"value" real NOT NULL,
	"overall_rank" integer,
	"position_rank" integer,
	"trend_30day" real,
	"redraft_value" real,
	"tier" integer,
	"source" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_player_values_asset_date_source" ON "player_values" USING btree ("asset_id","snapshot_date","source");--> statement-breakpoint
CREATE INDEX "idx_player_values_asset_date" ON "player_values" USING btree ("asset_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "idx_player_values_snapshot_date" ON "player_values" USING btree ("snapshot_date");