# UXA Prompt: Story 8.1

## Your Role
Read and follow your agent persona at `_agents/uxa.md`.

## Story Context
- **Story:** 8.1 - Tone Down Team Award Stats & Add Icons to Awards and Sting Cards
- **Epic:** 8 - UI/UX Polish Fixes
- **Working directory:** `_work/epic-8/story-8.1/`

## Inputs
1. **REQS brief:** `_work/epic-8/story-8.1/reqs-brief.md`
2. **Design doc:** `_bmad-output/planning-artifacts/ux-design-specification.md` (focus on: Component Tiers, Typography Scale, Design Tokens, Card Components)
3. **Cross-story context:** `_work/epic-8/cross-story-context.md`
4. **Project guidelines:** `CLAUDE.md`
5. **Existing components:** `components/team-award-card.tsx`, `components/sting-card.tsx`, `components/player-award-card.tsx`

## Output
Write your component and interaction spec to: `_work/epic-8/story-8.1/uxa-spec.md`
Write your checkpoint to: `_work/epic-8/story-8.1/uxa-checkpoint.json`

## Orchestrator Notes
Key decisions needed from UXA:
1. Confirm text-h2 is the right size for team award stats (currently text-display is way too big)
2. Specify exact icon placement: inline-left of label? Separate row? Size and color.
3. Specify the icon visual style: outline vs filled, stroke width, consistent style across all icons
4. Confirm that icons should be 18px and use currentColor
5. Specify how icons interact with the label's uppercase tracking (visual alignment)
6. Address all card types: TeamAwardCard, StingCard, PlayerAwardCard

## Instructions
1. Read the REQS brief for implementation requirements
2. Read the existing component code to understand current layout
3. Read the UX design specification for typography and component patterns
4. Produce the component and interaction spec per the output format defined in your persona
5. Update `_work/pipeline-state.json`: set story 8.1 state to `uxa-complete`
