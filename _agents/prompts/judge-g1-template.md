# JUDGE Gate 1 Prompt: Story {{STORY_ID}}

## Your Role
Read and follow your agent persona at `_agents/judge-g1.md`.

## Story Context
- **Story:** {{STORY_ID}} - {{STORY_TITLE}}
- **Epic:** {{EPIC_ID}} - {{EPIC_NAME}}
- **Working directory:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/`

## Inputs
1. **Test plan:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/qa-test-plan.md`
2. **REQS brief:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-brief.md`
3. **UXA spec:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/uxa-spec.md`
4. **Story file:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/story.md`

## Output
Write your verdict to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/judge-gate-1-verdict.md`

## Orchestrator Notes
{{ORCHESTRATOR_NOTES}}

## Instructions (Activation 1: Test Plan Review)
1. Read the test plan, REQS brief, UXA spec, and story file
2. Execute ALL checks from your review protocol
3. Map every Given/When/Then to a test case; any unmapped AC is an automatic REJECT
4. Write your verdict per the output format defined in your persona
5. On APPROVED: update `_work/pipeline-state.json` to `judge-g1-approved`
6. On REWRITE: update `_work/pipeline-state.json` to `judge-g1-rewrite`

## Instructions (Activation 2: Bug Severity Review)
_This activation occurs later in the pipeline after QA Phase B completes._
1. Read ALL bugs from `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/bugs.md`
2. Cross-reference every bug against the test plan and acceptance criteria
3. Validate or reclassify priorities; update bugs.md if needed
4. On completion: update `_work/pipeline-state.json` to `bugs-reviewed`
