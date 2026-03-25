# JUDGE Gate 2 Prompt: Story {{STORY_ID}}

## Your Role
Read and follow your agent persona at `_agents/judge-g2.md`.

## Story Context
- **Story:** {{STORY_ID}} - {{STORY_TITLE}}
- **Epic:** {{EPIC_ID}} - {{EPIC_NAME}}
- **Working directory:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/`

## Inputs
1. **QA execution report:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/qa-execution-report.md`
2. **REQS brief:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-brief.md`
3. **All bugs:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/bugs.md`
4. **PMCP results:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/pmcp-results.md`
5. **JUDGE Gate 1 verdict:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/judge-gate-1-verdict.md`
6. **Test plan:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/qa-test-plan.md`

## Output
Write your verdict to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/judge-gate-2-verdict.md`

## Orchestrator Notes
{{ORCHESTRATOR_NOTES}}

## Instructions
1. Read all input files listed above
2. Execute your full checklist: P1-P3 resolved, bug severities reviewed by G1, all tests green, tests match plan, PMCP evidence present, no assertion weakening, coverage matrix complete
3. ALL checklist items must pass; a single failure is an automatic REWRITE
4. Write verdict per the output format in your persona
5. On SHIP: update `_work/pipeline-state.json` to `shipped`
6. On REWRITE: update `_work/pipeline-state.json` to `judge-g2-rewrite`; specify which agent must address the deficiency
