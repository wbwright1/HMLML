# Story 9.4: Fix Draft Board Readability, Theme Colors, and React Key Errors

## Issues

### 1. Pick cells are unreadable
- Cell height (52px) is too small for 3 lines of content
- Font sizes (11-13px) are too small
- White text opacity (0.75, 0.85) reduces contrast
- Need taller cells and larger text

### 2. Position colors too vivid for theme
- WR blue (#3A6FC4) introduces a color not in the HMLML palette
- RB green (#1E8A6E) is oversaturated vs brand green
- Colors should be muted/warm to match "Press Box Evolved" aesthetic
- Use HMLML token colors where possible (accent-warm, accent-green, accent-gold)

### 3. React key and hydration errors
- Multiple components use array index as key (causes reconciliation bugs)
- Affected: app/page.tsx (last week results), mobile-table-view.tsx, playoff-bracket-card.tsx, transaction-activity-card.tsx
- Need stable, unique keys based on data identity

## Acceptance Criteria

AC1: Pick cells are readable with clear hierarchy (pick number, name, position)
AC2: Position colors are muted/warm, consistent with HMLML theme
AC3: No React console warnings about duplicate keys
AC4: No hydration mismatch errors
