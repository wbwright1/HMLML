CREATE TABLE "rivalries" (
	"id" serial PRIMARY KEY NOT NULL,
	"franchise_a_id" text NOT NULL,
	"franchise_b_id" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"origin" text,
	"origin_year" integer,
	"trophy_name" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "chk_rivalries_canonical_pair" CHECK ("rivalries"."franchise_a_id" COLLATE "C" < "rivalries"."franchise_b_id" COLLATE "C")
);
--> statement-breakpoint
ALTER TABLE "rivalries" ADD CONSTRAINT "rivalries_franchise_a_id_franchises_id_fk" FOREIGN KEY ("franchise_a_id") REFERENCES "public"."franchises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rivalries" ADD CONSTRAINT "rivalries_franchise_b_id_franchises_id_fk" FOREIGN KEY ("franchise_b_id") REFERENCES "public"."franchises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_rivalries_pair" ON "rivalries" USING btree ("franchise_a_id","franchise_b_id");--> statement-breakpoint
CREATE INDEX "idx_rivalries_franchise_b_id" ON "rivalries" USING btree ("franchise_b_id");