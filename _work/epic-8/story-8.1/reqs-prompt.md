# REQS Prompt: Story 8.1

## Your Role
Read and follow your agent persona at `_agents/reqs.md`.

## Story Context
- **Story:** 8.1 - Tone Down Team Award Stats & Add Icons to Awards and Sting Cards
- **Epic:** 8 - UI/UX Polish Fixes
- **Working directory:** `_work/epic-8/story-8.1/`

## Inputs
1. **Story file:** `_work/epic-8/story-8.1/story.md`
2. **UX Design Spec:** `_bmad-output/planning-artifacts/ux-design-specification.md` (focus on: Component Tiers, Typography, Design Tokens, Animation Philosophy)
3. **Architecture doc:** `CLAUDE.md` (focus on: Visual Design, Component Tiers, Naming Conventions)
4. **Cross-story context:** `_work/epic-8/cross-story-context.md`
5. **Existing components:** `components/team-award-card.tsx`, `components/sting-card.tsx`, `components/player-award-card.tsx`

## Output
Write your implementation brief to: `_work/epic-8/story-8.1/reqs-brief.md`
Write your checkpoint to: `_work/epic-8/story-8.1/reqs-checkpoint.json`

## Orchestrator Notes
This is a pure frontend story. No database changes, no API changes. The stat size change is straightforward (text-display -> text-h2). The icon system needs careful specification: what icons for which labels, size, color, placement. Icons must be inline SVGs, NOT an icon library. Keep the icon map centralized and extensible. Respect the no-emoji-unless-requested rule in CLAUDE.md for code output, but the icons themselves are UI elements, not emoji in text.

## Instructions
1. Read the story file for acceptance criteria
2. Read the targeted UX spec and architecture sections listed above
3. Read the existing component code to understand current structure
4. Read the cross-story context for patterns from prior stories
5. Produce the implementation brief per the output format defined in your persona
6. Update `_work/pipeline-state.json`: set story 8.1 state to `reqs-complete`
