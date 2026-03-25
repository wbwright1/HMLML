# UXA Prompt: Story {{STORY_ID}}

## Your Role
Read and follow your agent persona at `_agents/uxa.md`.

## Story Context
- **Story:** {{STORY_ID}} - {{STORY_TITLE}}
- **Epic:** {{EPIC_ID}} - {{EPIC_NAME}}
- **Working directory:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/`

## Inputs
1. **REQS brief:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-brief.md`
2. **Design doc:** `docs/Design.md` (focus on sections: {{DESIGN_SECTIONS}})
3. **Cross-story context:** `_work/epic-{{EPIC_ID}}/cross-story-context.md`
4. **Project guidelines:** `CLAUDE.md`

## Output
Write your component and interaction spec to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/uxa-spec.md`
Write your checkpoint to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/uxa-checkpoint.json`

## Orchestrator Notes
{{ORCHESTRATOR_NOTES}}

## Instructions
1. Read the REQS brief for implementation requirements
2. Read the targeted design doc sections listed above
3. Read the cross-story context for component patterns from prior stories
4. Query the Knowledge Agent for prior component patterns (if available)
5. Produce the component and interaction spec per the output format defined in your persona
6. For backend-only stories with no UI, write a brief N/A placeholder
7. Update `_work/pipeline-state.json`: set story {{STORY_ID}} state to `uxa-complete`
