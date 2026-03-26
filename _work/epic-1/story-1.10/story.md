# Story 1.10: Card Base Component

## Story
As a visitor,
I want cards that feel interactive and well-defined,
So that I know content is tappable and sections are visually separated.

## Acceptance Criteria

**Given** any card component renders
**When** viewed on any device
**Then** it has 12px border-radius, warm border (--border), surface background
**And** internal padding is 24px (20px for compact variant)
**And** the full card surface is the tap target
**When** hovered on desktop
**Then** a subtle border-strong or shadow appears with 150ms transition
**When** tapped on mobile
**Then** a brief opacity change (0.95) provides feedback

## Notes
- UX-DR37: Card tap pattern spec
