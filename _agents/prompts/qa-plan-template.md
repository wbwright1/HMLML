# QA Phase A Prompt: Story {{STORY_ID}}

## Your Role
Read and follow your agent persona at `_agents/qa-plan.md`.

## Story Context
- **Story:** {{STORY_ID}} - {{STORY_TITLE}}
- **Epic:** {{EPIC_ID}} - {{EPIC_NAME}}
- **Working directory:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/`

## Inputs
1. **REQS brief:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-brief.md`
2. **UXA spec:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/uxa-spec.md`
3. **Story file:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/story.md`
4. **Project guidelines:** `CLAUDE.md`

## Output
Write your test plan to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/qa-test-plan.md`

## Orchestrator Notes
{{ORCHESTRATOR_NOTES}}

## Instructions
1. Read the REQS brief and UXA spec for what needs testing
2. Read the story file for the raw acceptance criteria
3. Query the Knowledge Agent for test patterns and fixture conventions (if available)
4. Produce the structured test plan per the output format defined in your persona
5. Ensure every Given/When/Then from the story has a corresponding test case
6. Update `_work/pipeline-state.json`: set story {{STORY_ID}} state to `qa-plan-complete`
