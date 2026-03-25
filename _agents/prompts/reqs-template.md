# REQS Prompt: Story {{STORY_ID}}

## Your Role
Read and follow your agent persona at `_agents/reqs.md`.

## Story Context
- **Story:** {{STORY_ID}} - {{STORY_TITLE}}
- **Epic:** {{EPIC_ID}} - {{EPIC_NAME}}
- **Working directory:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/`

## Inputs
1. **Story file:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/story.md`
2. **Requirements doc:** `docs/Requirements.md` (focus on sections: {{REQ_SECTIONS}})
3. **Architecture doc:** `docs/Architecture.md` (focus on sections: {{ARCH_SECTIONS}})
4. **Cross-story context:** `_work/epic-{{EPIC_ID}}/cross-story-context.md`
5. **Project guidelines:** `CLAUDE.md`

## Output
Write your implementation brief to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-brief.md`
Write your checkpoint to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-checkpoint.json`

## Orchestrator Notes
{{ORCHESTRATOR_NOTES}}

## Instructions
1. Read the story file for acceptance criteria
2. Read the targeted requirement and architecture sections listed above
3. Read the cross-story context for decisions and patterns from prior stories in this epic
4. Query the Knowledge Agent for domain context and prior corrections (if available)
5. Produce the implementation brief per the output format defined in your persona
6. Update `_work/pipeline-state.json`: set story {{STORY_ID}} state to `reqs-complete`
