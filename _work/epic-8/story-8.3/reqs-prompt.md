# REQS Prompt: Story 8.3

## Your Role
Read and follow your agent persona at `_agents/reqs.md`.

## Story Context
- **Story:** 8.3 - Clean Up Records Leaderboard Table Styling
- **Epic:** 8 - UI/UX Polish Fixes
- **Working directory:** `_work/epic-8/story-8.3/`

## Inputs
1. **Story file:** `_work/epic-8/story-8.3/story.md`
2. **UX Design Spec:** `_bmad-output/planning-artifacts/ux-design-specification.md` (focus on: Records page, Tables, Design Tokens, Accessibility)
3. **Architecture doc:** `CLAUDE.md` (focus on: Visual Design tokens, Accessibility, Cards over tables)
4. **Cross-story context:** `_work/epic-8/cross-story-context.md`
5. **Existing components:** `app/records/leaderboard-table.tsx`, `components/franchise-identity.tsx`

## Output
Write your implementation brief to: `_work/epic-8/story-8.3/reqs-brief.md`
Write your checkpoint to: `_work/epic-8/story-8.3/reqs-checkpoint.json`

## Orchestrator Notes
This story needs strong UXA input. The main issue is the 3px colored left border on table rows that looks like a rendering artifact. FranchiseIdentity already shows branding color via a swatch, so the row border is redundant. Also needs token cleanup (text-gold -> text-accent-gold, text-muted-foreground -> text-text-tertiary, bg-card -> bg-surface). UXA should recommend the table's visual treatment.

## Instructions
1. Read the story file for acceptance criteria
2. Read the targeted UX spec and architecture sections listed above
3. Read the existing component code to understand current structure
4. Read the cross-story context for patterns from prior stories
5. Produce the implementation brief per the output format defined in your persona
6. Update `_work/pipeline-state.json`: set story 8.3 state to `reqs-complete`
