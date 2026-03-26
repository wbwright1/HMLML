# REQS Prompt: Story 8.4

## Your Role
Read and follow your agent persona at `_agents/reqs.md`.

## Story Context
- **Story:** 8.4 - Fix Draft Detail Page Label Spacing
- **Epic:** 8 - UI/UX Polish Fixes
- **Working directory:** `_work/epic-8/story-8.4/`

## Inputs
1. **Story file:** `_work/epic-8/story-8.4/story.md`
2. **UX Design Spec:** `_bmad-output/planning-artifacts/ux-design-specification.md` (focus on: Spacing, Typography, Draft pages)
3. **Architecture doc:** `CLAUDE.md` (focus on: Spacing system, Typography)
4. **Cross-story context:** `_work/epic-8/cross-story-context.md`
5. **Existing components:** `app/drafts/[seasonYear]/page.tsx`, `components/mobile-table-view.tsx`, `components/page-section.tsx`

## Output
Write your implementation brief to: `_work/epic-8/story-8.4/reqs-brief.md`
Write your checkpoint to: `_work/epic-8/story-8.4/reqs-checkpoint.json`

## Orchestrator Notes
The -mt-8 negative margin on the badges row (line 91 of the draft detail page) is the primary culprit for squished labels. The spacing standardization commit (67e2ea5) may have also changed gaps. This is a pure spacing/layout fix. Also check MobileTableView card spacing (space-y-2 may need to be space-y-3).

## Instructions
1. Read the story file for acceptance criteria
2. Read the targeted UX spec and architecture sections listed above
3. Read the existing component code to understand current structure
4. Read the cross-story context for patterns from prior stories
5. Produce the implementation brief per the output format defined in your persona
6. Update `_work/pipeline-state.json`: set story 8.4 state to `reqs-complete`
