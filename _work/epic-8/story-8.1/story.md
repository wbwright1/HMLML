# Story 8.1: Tone Down Team Award Stats & Add Icons to Awards and Sting Cards

## User Story

**As a** visitor viewing the preseason hub,
**I want** the team award stat numbers to be appropriately sized (not display-weight massive) and see small thematic icons on award and sting cards,
**So that** the cards feel polished and visually distinctive without the stat numbers overwhelming the card layout.

## Current Problem

- `TeamAwardCard` uses `text-display` (56-64px, Black 900) for the stat value, which is far too large for a card context
- Award and sting cards are text-only with no visual flavor; small icons would add personality
- `StingCard` uses `text-h3` which is more appropriate but also lacks icons

## Acceptance Criteria

**Given** the preseason hub renders team award cards (Point Machine, Iron Curtain, Regular Season King)
**When** the page loads
**Then** the stat value uses `text-h2` (28-32px, Bold 700) instead of `text-display`
**And** each card displays a small thematic icon/emoji next to the label (e.g., a target/bullseye for Point Machine, a shield for Iron Curtain, a crown for Regular Season King)

**Given** the preseason hub renders sting cards (Wall of Shame section)
**When** the page loads
**Then** each sting card displays a small thematic icon next to the label (e.g., a skull for League Doormat, a broken glass for Glass Cannon, a boxing glove for Punching Bag)

**Given** the player award cards render
**When** the page loads
**Then** player award cards also receive small thematic icons next to their labels

**Given** any award or sting card renders on mobile
**When** the viewport is narrow
**Then** the icons scale appropriately and do not break the card layout

## Implementation Notes

- **File:** `components/team-award-card.tsx` - change `text-display` to `text-h2` for the stat
- **File:** `components/sting-card.tsx` - add icon support
- **File:** `components/player-award-card.tsx` - add icon support
- Use inline SVG icons or a small icon map keyed by label name; do NOT add an icon library dependency
- Icons should be 16-20px, muted in color (use `text-text-tertiary` or tone color at reduced opacity)
- The icon map should be centralized (e.g., in a `lib/award-icons.tsx` or co-located constant)
- Keep icons simple and universally recognizable; prefer abstract symbols over literal illustrations
