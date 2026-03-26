# UXA Prompt: Story 8.3

## Your Role
Read and follow your agent persona at `_agents/uxa.md`.

## Story Context
- **Story:** 8.3 - Clean Up Records Leaderboard Table Styling
- **Epic:** 8 - UI/UX Polish Fixes
- **Working directory:** `_work/epic-8/story-8.3/`

## Inputs
1. **REQS brief:** `_work/epic-8/story-8.3/reqs-brief.md`
2. **Design doc:** `_bmad-output/planning-artifacts/ux-design-specification.md` (focus on: Records page, Tables, Design Tokens, Mobile patterns, Accessibility)
3. **Cross-story context:** `_work/epic-8/cross-story-context.md`
4. **Project guidelines:** `CLAUDE.md`
5. **Existing component:** `app/records/leaderboard-table.tsx`, `components/franchise-identity.tsx`

## Output
Write your component and interaction spec to: `_work/epic-8/story-8.3/uxa-spec.md`
Write your checkpoint to: `_work/epic-8/story-8.3/uxa-checkpoint.json`

## Orchestrator Notes
THIS IS THE CRITICAL UXA STORY. The user specifically asked the UX Analyst to look at this and recommend something. Key decisions needed:
1. Should the left border be completely removed, or replaced with something more tasteful?
2. For desktop: recommend the complete table visual treatment (borders, hover states, row separation)
3. For mobile: recommend branding color treatment. Options: (a) no color, uniform border, (b) small color dot next to team name, (c) thin 2px top accent bar on card, (d) other
4. Should desktop rows have hover:bg-surface-muted for scanability?
5. Overall: the table needs to look clean, institutional, "Press Box Evolved" not generic sports template
6. Read the FranchiseIdentity component to understand what branding info it already shows

Be opinionated here. The user wants a specific recommendation, not options.

## Instructions
1. Read the REQS brief for implementation requirements
2. Read the existing leaderboard table code AND the FranchiseIdentity component
3. Read the UX design specification for table and records page patterns
4. Produce the component and interaction spec with SPECIFIC recommendations (not multiple options)
5. Update `_work/pipeline-state.json`: set story 8.3 state to `uxa-complete`
