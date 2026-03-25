# FEND Prompt: Story {{STORY_ID}}

## Your Role
Read and follow your agent persona at `_agents/fend.md`.

## Story Context
- **Story:** {{STORY_ID}} - {{STORY_TITLE}}
- **Epic:** {{EPIC_ID}} - {{EPIC_NAME}}
- **Working directory:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/`

## Inputs
1. **REQS brief:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-brief.md`
2. **UXA spec:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/uxa-spec.md`
3. **Approved test plan:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/qa-test-plan.md`
4. **Shared types and validation schemas:** (created by BEND; check the codebase)
5. **Cross-story context:** `_work/epic-{{EPIC_ID}}/cross-story-context.md`
6. **Design doc:** `docs/Design.md`
7. **Project guidelines:** `CLAUDE.md`

## Output
Write your handoff to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/fend-handoff.md`
Write checkpoints to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/fend-checkpoint.json`

## Orchestrator Notes
{{ORCHESTRATOR_NOTES}}

## Instructions
1. Read the UXA spec for component structure, interactions, and states
2. Read the REQS brief for feature requirements and API shapes
3. Read the approved test plan for FE-T* test cases you must implement
4. Read the design doc and project guidelines for styling and conventions
5. Read the cross-story context for component patterns from prior stories
6. Query the Knowledge Agent for UI patterns and prior conventions (if available)
7. Write production code: components, pages, hooks, route definitions, client state
8. Write E2E test code implementing each FE-T* test case from the plan
9. Self-validate: run tests before signaling completion
10. Write the handoff file per the format in your persona
11. Update `_work/pipeline-state.json` to `fend-complete`
