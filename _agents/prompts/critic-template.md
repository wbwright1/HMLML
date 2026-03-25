# CRITIC Prompt: Story {{STORY_ID}}

## Your Role
Read and follow your agent persona at `_agents/critic.md`.

## Story Context
- **Story:** {{STORY_ID}} - {{STORY_TITLE}}
- **Epic:** {{EPIC_ID}} - {{EPIC_NAME}}
- **Working directory:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/`

## Inputs (Diff-First)
1. **Git diff:** Run `git diff {{BASE_REF}}` and `git diff --stat {{BASE_REF}}` for the primary review context
2. **REQS brief:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/reqs-brief.md`
3. **BEND handoff:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/bend-handoff.md`
4. **FEND handoff:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/fend-handoff.md`
5. **Approved test plan:** `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/qa-test-plan.md`
6. **Project guidelines:** `CLAUDE.md`

## Output
Write your review to: `_work/epic-{{EPIC_ID}}/story-{{STORY_ID}}/critic-review.md`

## Orchestrator Notes
{{ORCHESTRATOR_NOTES}}

## Instructions
1. Run `git diff {{BASE_REF}}` and `git diff --stat {{BASE_REF}}` as your primary context
2. Read the REQS brief for intent; read BEND/FEND handoffs for decisions made
3. Walk through every item in your review checklist against the diff
4. Review BOTH production code and test code with equal scrutiny
5. When the diff raises questions: query Knowledge Agent first (if available), then read full files, then message BEND/FEND
6. Tag findings: `[CONVENTION]`, `[PITFALL]`, `[VIOLATION-FIXED]`
7. Write verdict per the output format in your persona
8. On APPROVED: update `_work/pipeline-state.json` to `critic-approved`
9. On REJECTED: update `_work/pipeline-state.json` to `critic-rejected`; message BEND/FEND with specific violations
