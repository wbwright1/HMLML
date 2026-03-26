---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 2.1
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: [CRITICAL: Schema change and migration already exist in codebase; see Open Questions]
---

## Story Reference

**Story 2.1: Co-Owner Schema & Migration**
**Epic 2: Co-Owner Recognition**
**Requirement:** FR21 (from epics.md)

> A `coOwnerDisplayName` field shall be added to the franchise_seasons table with a Drizzle migration.

## Restated Acceptance Criteria

Each Given/When/Then from the story is restated below with implementation detail.

| # | Criterion (from story.md) | Implementation Detail | FR/NFR |
|---|---|---|---|
| AC-1 | **Given** the existing `franchise_seasons` table **When** the migration runs **Then** a nullable `coOwnerDisplayName` text field is added | Column `co_owner_display_name` of type `text`, nullable, no default value, added via `ALTER TABLE` | FR21 |
| AC-2 | The Drizzle schema in `lib/db/schema.ts` is updated to include the new column | `coOwnerDisplayName: text("co_owner_display_name")` added to the `franchiseSeasons` table definition | FR21 |
| AC-3 | A Drizzle migration is generated and can be applied cleanly | Migration generated via `npx drizzle-kit generate` and applied via `npx drizzle-kit migrate` (or `drizzle-kit push`) without errors | FR21 |
| AC-4 | The field is queryable via Drizzle ORM | The column must be selectable, filterable (`eq`, `isNull`, `isNotNull`), and insertable/updatable via Drizzle's query builder | FR21 |
| AC-5 | Existing rows have `null` for `coOwnerDisplayName` | The column is nullable with no default; `ALTER TABLE ADD COLUMN` on a nullable column without a default naturally leaves all existing rows as `null` | FR21 |

## Database Changes

### Column Addition

**Table:** `franchise_seasons`
**Column name (Postgres):** `co_owner_display_name`
**Column name (Drizzle):** `coOwnerDisplayName`
**Type:** `text` (nullable, no default)
**Migration SQL:** `ALTER TABLE "franchise_seasons" ADD COLUMN "co_owner_display_name" text;`

### What Is NOT Changed

- No new tables created.
- No indexes added (the column is not queried independently; it is always fetched alongside `owner_display_name` in row-level selects).
- No foreign key constraints (the value is a resolved display name string, not a relational reference).
- No existing columns modified.

## CRITICAL FINDING: Implementation Already Exists

Analysis of the codebase reveals that **all acceptance criteria for Story 2.1 are already satisfied**:

1. **Schema** (`lib/db/schema.ts`, line 67): The `coOwnerDisplayName: text("co_owner_display_name")` column already exists in the `franchiseSeasons` table definition.

2. **Migration** (`lib/db/migrations/0001_known_nebula.sql`): The migration `ALTER TABLE "franchise_seasons" ADD COLUMN "co_owner_display_name" text;` already exists and is registered in the migration journal (`meta/_journal.json`, entry idx 1).

3. **Type helpers** (`lib/db/schema.ts`, lines 262-263): The `FranchiseSeason` and `NewFranchiseSeason` inferred types already include `coOwnerDisplayName`.

4. **Queryability proven**: The column is already queried in:
   - `lib/queries/franchises.ts` (franchise detail and owner map queries)
   - `lib/queries/seasons.ts` (season detail queries)
   - `app/page.tsx`, `app/teams/[franchiseSlug]/page.tsx`, `app/seasons/[seasonYear]/page.tsx`

5. **Sync already writes to it**: `lib/sync/daily.ts` already resolves co-owner display names from the Sleeper `co_owners` roster array and writes to this column (this is Story 2.2 scope but was implemented ahead of schedule).

## API Endpoints

None. Story 2.1 is schema-only; no API endpoints are created or modified.

## Validation Schemas

No new Zod schemas are required for this story. The Sleeper API response schemas that include `co_owners` data are part of Story 2.2's scope. The Drizzle-inferred TypeScript types (`FranchiseSeason`, `NewFranchiseSeason`) automatically include the new nullable field.

## Business Rules

| Rule | Detail | FR/NFR |
|---|---|---|
| BR-1 | The `coOwnerDisplayName` field is nullable; franchises without co-owners have `null` | FR21 |
| BR-2 | The column stores a resolved display name string, not a user ID | FR21 |
| BR-3 | When multiple co-owners exist, their names are joined with " & " separator (this is a Story 2.2/2.3 concern but informs schema design: the field must accommodate multi-name strings) | FR21, UX-DR11 |
| BR-4 | The migration must be additive-only (no destructive changes to existing columns or data) | FR21 |

## Cross-Cutting Concerns Checklist

| Concern | Status | Notes |
|---|---|---|
| Drizzle ORM convention (snake_case columns, camelCase code) | Satisfied | `co_owner_display_name` in Postgres, `coOwnerDisplayName` in TypeScript |
| Naming convention (CLAUDE.md) | Satisfied | Column follows `{referenced_concept}_display_name` pattern consistent with `owner_display_name` |
| No raw SQL outside migrations | Satisfied | Migration is auto-generated SQL; all runtime access via Drizzle ORM |
| Migration journal integrity | Satisfied | Migration registered in `meta/_journal.json` with sequential idx |
| Type helpers updated | Satisfied | Inferred types in schema.ts automatically include the new field |
| No new dependencies | Satisfied | Uses existing drizzle-orm and drizzle-kit only |

## NFR Targets

No NFRs are directly assigned to Story 2.1 in the epics document. The following are implicitly relevant:

| NFR | Relevance | Target |
|---|---|---|
| (Data durability, Architecture Principle #2) | Migration must be reversible and non-destructive | Adding a nullable column with no default is inherently safe and reversible via `ALTER TABLE DROP COLUMN` |
| (Forward-compatible schema, Architecture Principle #5) | Schema should accommodate Phase 2+ | A nullable text field is maximally flexible for future co-owner data needs |

## Forward Dependencies

| Downstream Story | Dependency on 2.1 | Notes |
|---|---|---|
| **Story 2.2: Co-Owner Sync & Legacy Import** | Requires the `co_owner_display_name` column to exist so sync logic can write to it | FR22 |
| **Story 2.3: Co-Owner Display Across Site** | Requires the column to be queryable so display components can read it | FR23, FR24, UX-DR11 |

## Open Questions

1. **Story 2.1 appears to be already complete.** The schema column, migration, type helpers, and even downstream query usage all exist in the codebase. The developer implementing this story should verify that:
   - The migration has been applied to the production/staging database (not just generated locally).
   - Running `npx drizzle-kit generate` produces no new migration output (confirming schema and migrations are in sync).
   - If the migration has already been applied, this story may be marked as complete with a verification pass only.

2. **No conflicts detected.** All acceptance criteria align with architecture decisions. The column naming follows established patterns (`owner_display_name` -> `co_owner_display_name`). The nullable-text approach matches the architecture's "forward-compatible schema" principle.
