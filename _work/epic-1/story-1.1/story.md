# Story 1.1: Color Token Audit & Update

## Story
As a visitor,
I want the site to use a consistent, warm color palette,
So that every page feels cohesive and intentionally designed.

## Acceptance Criteria

**Given** the UX spec defines 15 named semantic color tokens
**When** the globals.css is audited against the spec
**Then** all 15 tokens match their specified hex values exactly
**And** no hardcoded hex values exist outside the token system (except dynamic franchise brandingColor)
**And** all shadcn/ui aliases reference the semantic tokens via var()
**And** no red/purple color pairings exist anywhere in the UI
**And** WCAG AA contrast ratios are verified: text-primary on canvas >= 4.5:1, text-secondary on canvas >= 4.5:1, accent-green on canvas >= 3:1

## Notes
- UX-DR1: Implement complete Press Box Evolved color token system with 15 named semantic tokens
- NFR12, NFR13, NFR14: Accessibility and contrast requirements
