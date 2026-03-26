# Story 1.4: Snarky Label Content System

## Story
As a developer,
I want a centralized content system for superlative labels,
So that snarky copy is consistent and easy to update without touching component code.

## Acceptance Criteria

**Given** the content system TypeScript constant
**When** a component needs a superlative label
**Then** all 14+ labels are available (Point Machine, Iron Curtain, Alpha Dog, League Doormat, Glass Cannon, Paper Tiger, Draft Day Genius, Wasted Picks, On Fire, Rock Bottom, Mercy Rule, Cardiac Crew, What Could've Been, Coaching Malpractice)
**And** each label includes context (what triggers it), tone (positive/sting/neutral), and display text
**And** labels are importable from a single `lib/content.ts` module

## Notes
- This is a pure data module with no UI; just TypeScript constants
- Each label entry should include: key, displayText, description (what triggers it), tone ('positive' | 'sting' | 'neutral')
- The module should be easily extensible for future labels
- No UI components in this story; just the data/type definitions
