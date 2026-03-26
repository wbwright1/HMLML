---
## Orchestrator Summary
- **Agent**: QA Phase A
- **Story**: 1.1 - Project Scaffolding
- **Verdict**: PLAN COMPLETE
- **State transition**: reqs-complete -> qa-plan-complete
- **Notes**: Lightweight plan per orchestrator guidance. Three concrete changes to verify: `drizzle-zod` installed, `@neondatabase/serverless` retained (no `@vercel/postgres`), hourly cron added to `vercel.json`. No E2E tests required. No database state changes. Build verification is the primary gate.
---

# QA Test Plan: Story 1.1 — Project Scaffolding

## Test Strategy

This story has no UI changes and no schema changes. The three deliverables are:

1. `drizzle-zod` present in `package.json` dependencies and installed in `node_modules`
2. `@neondatabase/serverless` retained as the active DB driver (no `@vercel/postgres` substitution per orchestrator decision)
3. `vercel.json` `crons` array contains an entry for `/api/sync-hourly` on schedule `0 * * * *`

All tests are static inspection tests (file content checks) plus one build verification. No database is needed. No running server is needed for the file-content checks. The build check requires `npm run build` to exit cleanly.

No shared state. No execution order dependencies between TC-1 through TC-3. TC-4 (build) must run after TC-1 and TC-2 are confirmed (packages must be installed before building).

---

## AC Coverage Matrix

| Story AC | Clause Being Verified | Test Case(s) |
|---|---|---|
| AC-2: `drizzle-zod` installed | `package.json` lists `drizzle-zod`; `node_modules/drizzle-zod` exists | TC-1 |
| AC-2: `@neondatabase/serverless` retained | `lib/db/index.ts` imports from `@neondatabase/serverless`; package present | TC-2 |
| AR10: Hourly cron in `vercel.json` | `vercel.json` crons array has `/api/sync-hourly` at `0 * * * *` | TC-3 |
| All AC-2 packages: no build regression | `npm run build` exits with code 0 | TC-4 |

---

## API Tests

Not applicable. No new or modified API endpoints in this story.

---

## Static Inspection Tests

### TC-1: `drizzle-zod` Installed

**Purpose:** Verify `drizzle-zod` satisfies the missing-dependency gap identified by REQS.

**Given:** The IMPL agent has run `npm install drizzle-zod`

**When:** The tester inspects `package.json` and the installed modules

**Then:**
- `package.json` `dependencies` object contains a key `"drizzle-zod"` with a version value (any semver string is acceptable)
- The directory `node_modules/drizzle-zod` exists and is non-empty
- No duplicate or conflicting `drizzle-zod` entry exists in `devDependencies`

**How to check:**
```
# In the project root:
cat package.json | grep drizzle-zod
ls node_modules/drizzle-zod
```

**Pass condition:** Both commands return results with no errors.

**Fail condition:** Key absent from `package.json`, or `node_modules/drizzle-zod` directory missing.

**Database state:** Not applicable.

---

### TC-2: `@neondatabase/serverless` Retained as Active DB Driver

**Purpose:** Verify the orchestrator's decision (do NOT install `@vercel/postgres`; keep `@neondatabase/serverless`) is correctly implemented.

**Given:** The IMPL agent has resolved OQ-2 in favor of retaining `@neondatabase/serverless`

**When:** The tester inspects `package.json` and `lib/db/index.ts`

**Then:**
- `package.json` `dependencies` contains `"@neondatabase/serverless"` (already present pre-story; must not have been removed)
- `lib/db/index.ts` imports from `"@neondatabase/serverless"` (not from `"@vercel/postgres"`)
- `@vercel/postgres` is NOT present in `package.json` `dependencies` or `devDependencies`
- `node_modules/@neondatabase/serverless` exists

**How to check:**
```
# Confirm @neondatabase/serverless present in package.json:
cat package.json | grep neondatabase

# Confirm @vercel/postgres NOT present:
cat package.json | grep vercel/postgres    # should return nothing

# Confirm lib/db/index.ts import source:
grep -n "neondatabase\|vercel-postgres\|vercel/postgres" lib/db/index.ts
```

**Pass condition:** `@neondatabase/serverless` found in `package.json`; `@vercel/postgres` absent; `lib/db/index.ts` imports from `@neondatabase/serverless`.

**Fail condition:** `@vercel/postgres` appears anywhere in `package.json`, or `lib/db/index.ts` import source changed to `@vercel/postgres`.

**Database state:** Not applicable.

---

### TC-3: Hourly Cron Entry in `vercel.json`

**Purpose:** Verify AR10 is satisfied by the presence of the hourly cron configuration for `/api/sync-hourly`.

**Given:** The IMPL agent has edited `vercel.json`

**When:** The tester reads `vercel.json`

**Then:**
- The `crons` array contains exactly two entries (one daily, one hourly)
- The hourly entry has `"path": "/api/sync-hourly"` and `"schedule": "0 * * * *"`
- The existing daily entry (`/api/sync-daily` at `0 6 * * *`) is unchanged and still present
- The file is valid JSON (no syntax errors)

**How to check:**
```
# Read full crons array:
cat vercel.json

# Validate JSON syntax:
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('valid JSON')"
```

**Pass condition:** Both cron entries present with correct paths and schedules; file parses as valid JSON.

**Fail condition:** Hourly entry missing; daily entry accidentally modified; file contains invalid JSON.

**Database state:** Not applicable.

---

## Build Verification Test

### TC-4: Production Build Succeeds

**Purpose:** Confirm that adding `drizzle-zod` to dependencies does not introduce any TypeScript errors, import resolution failures, or Next.js build errors.

**Given:** TC-1 and TC-2 have passed (packages correctly installed or not installed)

**When:** The tester runs `npm run build` in the project root

**Then:**
- The command exits with code 0
- No TypeScript type errors appear in build output
- No module-not-found errors appear in build output
- No ESLint errors that are configured as errors appear in build output

**How to check:**
```
npm run build
echo "Exit code: $?"
```

**Pass condition:** Exit code 0. No errors in stdout/stderr.

**Fail condition:** Non-zero exit code; any `error TS` lines; any `Module not found` lines; any ESLint error lines.

**Note:** `npm run lint` and `npx tsc --noEmit` should also be run independently as pre-build sanity checks (these are listed in the REQS implementation checklist). A clean lint and type-check is a prerequisite to a clean build.

**Database state:** Not applicable.

---

## Security / Isolation Tests

Not applicable for this story. No new endpoints, no auth changes, no cron secret changes. The `CRON_SECRET` verification already exists in the sync handlers and is tested in later Epic 2 stories.

---

## Edge Case Tests

### TC-5: `vercel.json` Has No Duplicate Cron Entries

**Purpose:** Catch a common mistake where an implementer appends rather than sets, resulting in duplicate entries.

**Given:** `vercel.json` has been edited

**When:** The tester counts cron entries for each path

**Then:**
- `/api/sync-daily` appears exactly once in the `crons` array
- `/api/sync-hourly` appears exactly once in the `crons` array

**How to check:**
```
node -e "const v=JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log(v.crons.length, 'entries'); v.crons.forEach(c=>console.log(c.path, c.schedule))"
```

**Pass condition:** Output shows exactly 2 entries, one for each path.

**Fail condition:** Any path appears more than once.

**Database state:** Not applicable.

---

### TC-6: `drizzle-zod` Version Compatibility with `drizzle-orm`

**Purpose:** Verify the installed `drizzle-zod` version is compatible with the installed `drizzle-orm` version (`^0.45.1`).

**Given:** Both packages are installed

**When:** The tester checks peer dependency satisfaction

**Then:**
- `npm ls drizzle-zod` shows no peer dependency warnings or UNMET PEER DEPENDENCY errors
- `drizzle-zod` peer dependency on `drizzle-orm` is satisfied by the installed version

**How to check:**
```
npm ls drizzle-zod
```

**Pass condition:** Output shows `drizzle-zod` with no `UNMET` or `invalid` annotations.

**Fail condition:** Any peer dependency warning or error related to `drizzle-zod` or `drizzle-orm`.

**Database state:** Not applicable.

---

## PMCP Visual Checklist

Not applicable. This story has no UI changes, no components, no pages, and no visual output.

---

## What Is NOT Tested in This Plan

- Theme token values in `globals.css` (Story 1.2)
- Layout component rendering (Story 1.3)
- Snarky label content (Story 1.4)
- Empty state and error component rendering (Story 1.5)
- Actual invocation of the `/api/sync-hourly` endpoint (Epic 2 sync stories)
- `CRON_SECRET` header verification behavior (Epic 2 sync stories)
- `drizzle-zod` usage patterns — the package is installed but usage is deferred to Epic 2; no usage-level tests belong here
- Drizzle schema correctness (all tables present pre-story; no schema changes in this story)
- Playwright E2E navigation tests (already exist in `e2e/navigation.spec.ts`; not changed by this story)
- GitHub Actions workflow behavior (not changed by this story)
- Vercel environment variables (`POSTGRES_URL`, `CRON_SECRET`, `SLEEPER_LEAGUE_ID`) — these are deployment concerns outside the scope of scaffolding verification
