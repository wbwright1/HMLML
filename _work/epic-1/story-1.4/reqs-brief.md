---
## Orchestrator Summary
- **Agent**: REQS
- **Story**: 1.4 — Snarky Label Content System
- **Verdict**: COMPLETE
- **State transition**: analysis -> reqs-complete
- **Flags for orchestrator**: None. All acceptance criteria are fully specified. No conflicts with architecture decisions. An existing related module (`lib/playoff-labels.ts`) exists in the project and informs the pattern; see Business Rules.
---

## Story Reference

**Story 1.4: Snarky Label Content System**
**Epic:** 1 — Project Foundation & Design System
**Source requirement:** UX-DR25 (epics.md, line 114)
**UX spec references:** Content System (Snarky Labels) table (ux-design-specification.md, lines 1312-1332); Emotional Design Principles section (ux-design-specification.md, lines 78-119); Component Personality Layer note (ux-design-specification.md, lines 238-243)

---

## Restated Acceptance Criteria

The following Given/When/Then statements from `story.md` are restated verbatim and mapped to requirements:

**AC-1 (UX-DR25)**
- Given: the content system TypeScript constant exists in `lib/content.ts`
- When: a component needs a superlative label
- Then: all 14 labels listed below are available by key

**AC-2 (UX-DR25)**
- And: each label includes context (what triggers it), tone (`'positive' | 'sting' | 'neutral'`), and display text

**AC-3 (UX-DR25)**
- And: labels are importable from a single `lib/content.ts` module

---

## Database Changes

None. This story creates no database tables, columns, or migrations. It is a pure TypeScript data module.

---

## API Endpoints

None. This story creates no API routes.

---

## Validation Schemas

None. No Zod schemas are required; all data is compile-time constant with TypeScript types only.

---

## TypeScript Type Structure

The module must define and export the following types and constants. The developer must not deviate from this structure without flagging it.

### Tone Type

```typescript
export type LabelTone = 'positive' | 'sting' | 'neutral';
```

**Source:** story.md ("tone ('positive' | 'sting' | 'neutral')"). The UX spec uses "Neutral/fun" as a tone label in the table; the code representation is `'neutral'` per the story file.

### SnarkyLabel Interface

```typescript
export interface SnarkyLabel {
  key: string;           // machine-readable identifier, UPPER_SNAKE_CASE
  displayText: string;   // the label shown in UI (e.g. "Point Machine")
  description: string;   // what triggers this label (e.g. "Awarded to the franchise with the most points scored in the season")
  tone: LabelTone;       // determines visual treatment ('positive' | 'sting' | 'neutral')
}
```

**Source:** story.md ("Each label entry should include: key, displayText, description (what triggers it), tone"). The `key` field naming convention follows the project's `UPPER_SNAKE_CASE` for constants (CLAUDE.md, Naming Conventions).

### Labels Map Type

The constant must be typed as a readonly record keyed by the label's `key` field so consumers can look up labels by key without array iteration:

```typescript
export const SNARKY_LABELS: Record<string, SnarkyLabel> = { ... } as const;
```

Alternatively, a typed tuple array export is acceptable as a secondary export for iteration use cases. The primary export must be the map (Record) for O(1) key lookup.

---

## Required Label Entries

All 14 entries are fully specified. The `key` values below are the canonical machine-readable identifiers. The `displayText`, `description`, and `tone` values are derived from the UX spec Content System table (ux-design-specification.md, lines 1315-1330) and the story acceptance criteria (story.md, line 12).

| key | displayText | description (what triggers it) | tone |
|---|---|---|---|
| `POINT_MACHINE` | "Point Machine" | Franchise with the most points scored in the season (Most PF) | `'positive'` |
| `IRON_CURTAIN` | "Iron Curtain" | Franchise that allowed the fewest points against in the season (Least PA) | `'positive'` |
| `ALPHA_DOG` | "Alpha Dog" | Franchise with the best win-loss record in the season | `'positive'` |
| `LEAGUE_DOORMAT` | "League Doormat" | Franchise with the worst win-loss record in the season | `'sting'` |
| `GLASS_CANNON` | "Glass Cannon" | Franchise with high points scored but a poor win total (high PF, low wins) | `'sting'` |
| `PAPER_TIGER` | "Paper Tiger" | Franchise that allowed the most points against in the season (high PA) | `'sting'` |
| `DRAFT_DAY_GENIUS` | "Draft Day Genius" | Franchise with the best draft return on investment | `'positive'` |
| `WASTED_PICKS` | "Wasted Picks" | Franchise with the worst draft return on investment | `'sting'` |
| `ON_FIRE` | "On Fire" | Franchise with the longest win streak | `'positive'` |
| `ROCK_BOTTOM` | "Rock Bottom" | Franchise with the longest losing streak | `'sting'` |
| `MERCY_RULE` | "Mercy Rule" | Franchise that won by the biggest margin in a single matchup (biggest blowout win) | `'positive'` |
| `CARDIAC_CREW` | "Cardiac Crew" | Franchise that won by the smallest margin in a single matchup (closest win) | `'neutral'` |
| `WHAT_COULDVE_BEEN` | "What Could've Been" | Franchise with the highest best-possible roster score vs actual lineup (best possible roster) | `'neutral'` |
| `COACHING_MALPRACTICE` | "Coaching Malpractice" | Franchise with the largest gap between optimal lineup and actual lineup score (biggest underperformer) | `'sting'` |

**Tone source notes:**
- UX spec lists "Neutral/fun" for `CARDIAC_CREW` and `WHAT_COULDVE_BEEN`; resolved to `'neutral'` per story.md's type definition.
- All other tones match verbatim between story.md and the UX spec table.

---

## Business Rules

**BR-1: No hardcoded labels in components (UX-DR25, UX-DR8, UX-DR9)**
Components that render Team Award Cards (UX-DR8) and Sting Cards (UX-DR9) must import labels from `lib/content.ts`. No label string may be hardcoded in any component file. This rule is reinforced by Story 10.1's audit acceptance criteria (epics.md line 742: "all badge/label components use the snarky label content system").

**BR-2: Extensibility (story.md notes)**
The structure must be easily extensible. The Record-keyed map (see TypeScript Type Structure above) allows new entries without changing the type definition. No fixed-length tuple or enum must be used that would require a type change to add a new entry.

**BR-3: Existing pattern consistency (lib/playoff-labels.ts)**
The project already contains `lib/playoff-labels.ts`, which exports label-related utilities for playoff outcomes. `lib/content.ts` is a separate module; it must NOT merge with or import from `lib/playoff-labels.ts`. The two modules serve different domains (playoff result display vs. superlative/achievement labeling). The `playoff-labels.ts` pattern uses functions rather than a constant map; `lib/content.ts` should use the constant map pattern per UX-DR25.

**BR-4: Tone drives visual treatment, not standalone color (CLAUDE.md Semantic Indicators)**
The `tone` field signals which visual treatment a consuming component applies:
- `'positive'`: gold accent (`--accent-gold`), bold type weight (CLAUDE.md: "Championship / Award" row; UX spec line 372-373)
- `'sting'`: warm accent (`--accent-warm`), bold callout (CLAUDE.md: "Worst / Sting" row; UX spec line 374)
- `'neutral'`: standard border and type weight; no accent color
The `tone` value does NOT dictate color directly; components implement the color mapping. `lib/content.ts` only stores the semantic intent.

**BR-5: No red or purple in any visual treatment derived from tone (CLAUDE.md Accessibility)**
Consuming components must not use red or purple for any tone-driven color. This is enforced at the component layer (not in this module), but REQS flags it here for the developer's awareness.

**BR-6: No "use client" directive (CLAUDE.md Architecture)**
`lib/content.ts` is a pure data module. It must not include any React imports, hooks, or `"use client"` directive.

---

## Cross-Cutting Concerns Checklist

| Concern | Applies? | Notes |
|---|---|---|
| `"use client"` restriction | No | Pure TypeScript constant module; no React, no directive |
| Drizzle ORM usage | No | No database interaction |
| Zod validation | No | No external API or user input |
| Sync log | No | Not a sync job |
| Server Component | N/A | Not a component |
| WCAG AA contrast | Indirectly | `tone` field drives visual treatment; actual contrast enforced in consuming components |
| No red/purple | Indirectly | Enforced in consuming components, not this module |
| Tabular figures | No | No numeric content |
| Naming conventions | Yes | Keys in `UPPER_SNAKE_CASE`; file at `lib/content.ts` (`kebab-case`); type names `PascalCase` |
| No hardcoded hex | No | No colors in this module |

---

## NFR Targets

- **NFR: TypeScript strict mode** — The module must compile cleanly under `strict: true` (CLAUDE.md: "TypeScript (strict mode)"). No `any` types permitted.
- **NFR: Tree-shakeable** — Named exports only; no default export of a barrel object that forces importing the entire module.
- **NFR: Immutability** — The label map should be `as const` or use `readonly` to prevent mutation at runtime.

---

## Forward Dependencies

The following stories consume `lib/content.ts` and depend on this module being present and correctly structured before they can complete:

| Downstream story | Uses which labels | Reference |
|---|---|---|
| UX-DR8: Team Award Card (Story 3.x) | `POINT_MACHINE`, `IRON_CURTAIN`, `ALPHA_DOG` | epics.md line 97, ux-design-spec line 894 |
| UX-DR9: Sting Card (Story 3.x) | `LEAGUE_DOORMAT`, `GLASS_CANNON`, `PAPER_TIGER` | epics.md line 98, ux-design-spec lines 917-918 |
| UX-DR12: Weekly Superlative Card (Story 3.x) | `ON_FIRE`, `ROCK_BOTTOM`, `MERCY_RULE`, `CARDIAC_CREW`, `WHAT_COULDVE_BEEN`, `COACHING_MALPRACTICE` | epics.md line 101 |
| Story 10.1: Design System Audit | All labels | epics.md line 742 |
| Story 3.5: Best Possible Roster calc | `COACHING_MALPRACTICE`, `WHAT_COULDVE_BEEN` | epics.md line 435 |

---

## Open Questions

None. All acceptance criteria are fully specified by the story file and the UX spec Content System table. The tone-to-visual-treatment mapping is defined in CLAUDE.md and the UX spec. The module boundary is unambiguous.
