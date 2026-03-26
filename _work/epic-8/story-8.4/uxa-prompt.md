# UXA Prompt: Story 8.4

## Your Role
Read and follow your agent persona at `_agents/uxa.md`.

## Story Context
- **Story:** 8.4 - Fix Draft Detail Page Label Spacing
- **Epic:** 8 - UI/UX Polish Fixes
- **Working directory:** `_work/epic-8/story-8.4/`

## Inputs
1. **REQS brief:** `_work/epic-8/story-8.4/reqs-brief.md`
2. **Design doc:** `_bmad-output/planning-artifacts/ux-design-specification.md` (focus on: Spacing system, Typography, Draft pages)
3. **Cross-story context:** `_work/epic-8/cross-story-context.md`
4. **Project guidelines:** `CLAUDE.md`
5. **Existing components:** `app/drafts/[seasonYear]/page.tsx`, `components/mobile-table-view.tsx`, `components/page-section.tsx`

## Output
Write your component and interaction spec to: `_work/epic-8/story-8.4/uxa-spec.md`
Write your checkpoint to: `_work/epic-8/story-8.4/uxa-checkpoint.json`

## Orchestrator Notes
REQS identified the -mt-8 negative margin as the root cause. UXA needs to:
1. Confirm removing -mt-8 is the right fix and specify the replacement spacing
2. Decide: space-y-2 vs space-y-3 on MobileTableView card internals
3. Decide: space-y-10 vs space-y-8 between rounds
4. Specify the complete vertical rhythm for the draft detail page from top to bottom
5. Read PageSection component to understand its built-in spacing

## Instructions
1. Read the REQS brief for implementation requirements
2. Read the existing component code (draft detail page, MobileTableView, PageSection)
3. Read the UX design specification for spacing system
4. Produce the component and interaction spec with specific spacing values
5. Update `_work/pipeline-state.json`: set story 8.4 state to `uxa-complete`
