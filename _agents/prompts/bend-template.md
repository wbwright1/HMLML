# BEND Prompt: Story {{STORY_ID}}

## Your Role
Read and follow your agent persona at `_agents/bend.md`.

## Story Context
- **Story:** {{STORY_ID}} - {{STORY_TITLE}}
- **Epic:** {{EPIC_ID}} - {{EPIC_NAME}}
- **Working directory:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/`

## Inputs
1. **REQS brief:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-brief.md`
2. **UXA spec:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/uxa-spec.md`
3. **Approved test plan:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/qa-test-plan.md`
4. **Cross-story context:** `_work/epic-{{EPIC_ID}}/cross-story-context.md`
5. **Architecture doc:** `docs/Architecture.md`
6. **Project guidelines:** `CLAUDE.md`

## Output
Write your handoff to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/bend-handoff.md`
Write checkpoints to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/bend-checkpoint.json`

## Orchestrator Notes
{{ORCHESTRATOR_NOTES}}

## Instructions
1. Read the REQS brief for implementation requirements
2. Read the UXA spec for any backend implications (API shapes, data needs)
3. Read the approved test plan for BE-T* test cases you must implement
4. Read the architecture doc and project guidelines for conventions
5. Read the cross-story context for patterns and decisions from prior stories
6. Query the Knowledge Agent for domain patterns and prior CRITIC violations (if available)
7. Write production code: database schemas/migrations, API routes, services, validation, seed data
8. Write API test code implementing each BE-T* test case from the plan
9. Self-validate: run tests before signaling completion
10. Write the handoff file per the format in your persona
11. Update `_work/pipeline-state.json` to `bend-complete`
