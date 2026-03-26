# Story 4.6: Roster Row Component

## Story
As a visitor viewing a franchise roster,
I want to see each player's status clearly,
So that I know who's starting, benched, or injured.

## Acceptance Criteria

**Given** a Roster Row renders
**Then** it shows player headshot (or position icon fallback), name, position, NFL team
**And** starter designation uses bold weight; bench uses regular weight
**And** a status indicator shows Active, IR, Questionable, or Out with text labels
**And** IR players get dimmed treatment with IR badge
**And** the row shows average points per week if available

## Notes
- FR27: Full franchise roster view
- UX-DR21: Roster Row component spec
