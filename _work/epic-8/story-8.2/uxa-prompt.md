# UXA Prompt: Story 8.2

## Your Role
Read and follow your agent persona at `_agents/uxa.md`.

## Story Context
- **Story:** 8.2 - Draft Order Shows Full First Round on Hub with Link to All Rounds
- **Epic:** 8 - UI/UX Polish Fixes
- **Working directory:** `_work/epic-8/story-8.2/`

## Inputs
1. **REQS brief:** `_work/epic-8/story-8.2/reqs-brief.md`
2. **Design doc:** `_bmad-output/planning-artifacts/ux-design-specification.md` (focus on: Preseason Hub, Draft Order)
3. **Cross-story context:** `_work/epic-8/cross-story-context.md`
4. **Project guidelines:** `CLAUDE.md`
5. **Existing component:** `components/draft-order-card.tsx`

## Output
Write your component and interaction spec to: `_work/epic-8/story-8.2/uxa-spec.md`
Write your checkpoint to: `_work/epic-8/story-8.2/uxa-checkpoint.json`

## Orchestrator Notes
Straightforward layout change. UXA should confirm: with 12 items in the list, does the card need any visual rhythm breaks (e.g., alternating background on every other row, or a subtle divider after pick 6)? Also confirm the link style for "View Full Draft Order (All 3 Rounds)".

## Instructions
1. Read the REQS brief for implementation requirements
2. Read the existing component code
3. Read the UX design specification
4. Produce the component and interaction spec
5. Update `_work/pipeline-state.json`: set story 8.2 state to `uxa-complete`
