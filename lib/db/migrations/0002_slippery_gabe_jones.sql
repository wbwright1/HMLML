CREATE INDEX "idx_matchups_season_status" ON "matchups" USING btree ("season_id","status");--> statement-breakpoint
CREATE INDEX "idx_players_position" ON "players" USING btree ("position");--> statement-breakpoint
CREATE INDEX "idx_seasons_status" ON "seasons" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_transactions_season_id" ON "transactions" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_created_at_sleeper" ON "transactions" USING btree ("created_at_sleeper");