# REQS Prompt: Story 8.2

## Your Role
Read and follow your agent persona at `_agents/reqs.md`.

## Story Context
- **Story:** 8.2 - Draft Order Shows Full First Round on Hub with Link to All Rounds
- **Epic:** 8 - UI/UX Polish Fixes
- **Working directory:** `_work/epic-8/story-8.2/`

## Inputs
1. **Story file:** `_work/epic-8/story-8.2/story.md`
2. **UX Design Spec:** `_bmad-output/planning-artifacts/ux-design-specification.md` (focus on: Preseason Hub, Draft Order)
3. **Architecture doc:** `CLAUDE.md` (focus on: Seasonally-Aware Hub, Navigation Structure)
4. **Cross-story context:** `_work/epic-8/cross-story-context.md`
5. **Existing components:** `components/draft-order-card.tsx`, `app/page.tsx` (hub)

## Output
Write your implementation brief to: `_work/epic-8/story-8.2/reqs-brief.md`
Write your checkpoint to: `_work/epic-8/story-8.2/reqs-checkpoint.json`

## Orchestrator Notes
Pure frontend story. The DraftOrderCard currently slices to 4 picks. It needs to show all picks passed in (12 for a standard league, 10 for legacy era). The link target should be the draft detail page for the upcoming season, not just /drafts. Check how the hub page passes draft order data to understand what's available.

## Instructions
1. Read the story file for acceptance criteria
2. Read the targeted UX spec and architecture sections listed above
3. Read the existing component code to understand current structure
4. Read the cross-story context for patterns from prior stories
5. Produce the implementation brief per the output format defined in your persona
6. Update `_work/pipeline-state.json`: set story 8.2 state to `reqs-complete`
