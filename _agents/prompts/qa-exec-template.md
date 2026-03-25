# QA Phase B Prompt: Story {{STORY_ID}}

## Your Role
Read and follow your agent persona at `_agents/qa-exec.md`.

## Story Context
- **Story:** {{STORY_ID}} - {{STORY_TITLE}}
- **Epic:** {{EPIC_ID}} - {{EPIC_NAME}}
- **Working directory:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/`

## Inputs
1. **Test plan:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/qa-test-plan.md`
2. **REQS brief:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-brief.md`
3. **CRITIC review:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/critic-review.md`
4. **BEND handoff:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/bend-handoff.md`
5. **FEND handoff:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/fend-handoff.md`
6. **Project guidelines:** `CLAUDE.md`

## Test Commands
- **API/integration tests:** {{API_TEST_COMMAND}}
- **E2E tests:** {{E2E_TEST_COMMAND}}

## Output
Write bugs to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/bugs.md`
Write execution report to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/qa-execution-report.md`
Write PMCP checklist to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/pmcp-checklist.md`

## Orchestrator Notes
{{ORCHESTRATOR_NOTES}}

## Instructions
1. **REVIEW:** Compare implemented tests against the test plan; every plan item must have a corresponding test
2. **EXECUTE:** Run both test suites using the commands above
3. **TRIAGE:** If failures exist, group by root cause, categorize for prioritization
4. **BUG FILING:** File bugs to bugs.md with priority (P1-P4) and route (BEND/FEND); message devs directly for P1-P3
5. **VISUAL VALIDATION:** Write PMCP checklist, then message orchestrator: "Ready for visual validation"
6. **REPORT:** Write execution report with tagged lessons (`[WIRING-FIX]`, `[TEST-PATTERN]`, `[AUTH-SETUP]`)
7. Update `_work/pipeline-state.json` to `qa-executed`
