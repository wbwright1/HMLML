---
## Orchestrator Summary
- **Agent**: QA Phase A
- **Story**: 1.4 — Snarky Label Content System
- **Verdict**: COMPLETE
- **State transition**: reqs-complete -> qa-plan-complete
- **Flags for orchestrator**: None. This is a pure TypeScript data module. No E2E tests, no API tests, no database seed data, no PMCP visual checklist required. All tests are unit tests co-located at `lib/content.test.ts`.
---

## Test Strategy

`lib/content.ts` is a pure, compile-time constant module with no database interaction, no API calls, and no React dependencies. The entire implementation is TypeScript types and a literal data structure. The correct testing strategy is:

- **Unit tests only**, co-located at `lib/content.test.ts`
- Tests import the live module and assert on actual exported values
- No mocks, no stubs, no fixtures: the module IS the data; the tests assert against it directly
- TypeScript compilation itself serves as the primary type-safety assertion; tests verify runtime shape and completeness

Test runner: whatever the project uses for unit tests (likely Vitest or Jest, matching the existing `lib/playoff-labels.ts` test setup if present).

---

## AC Coverage Matrix

| AC | Given / When / Then clause | Test IDs |
|---|---|---|
| AC-1 | All 14 labels available by key from `lib/content.ts` | UT-01, UT-02 |
| AC-2 | Each label has `displayText`, `description`, `tone` fields with correct values | UT-03 through UT-16 (one per label), UT-17 |
| AC-3 | Labels importable from a single `lib/content.ts` module | UT-01 |
| BR-1 (no hardcoded labels in components) | Not testable as a unit test; flagged as a linting/audit concern for Story 10.1 | — |
| BR-2 (extensibility via Record map) | `SNARKY_LABELS` is a Record, not a fixed-length tuple or enum | UT-18 |
| BR-3 (no import from playoff-labels.ts) | Module source must not import from `lib/playoff-labels.ts` | UT-19 |
| BR-6 (no "use client" directive) | Module source must not contain `"use client"` | UT-20 |
| NFR: strict mode | Module compiles without errors under `strict: true` | UT-21 |
| NFR: named exports only | No default export present | UT-22 |
| NFR: immutability | `SNARKY_LABELS` is declared `as const` or readonly; direct mutation throws or is rejected by TypeScript | UT-23 |

---

## Unit Tests

### UT-01: Module exports `SNARKY_LABELS` and required types

**Purpose:** Verify the module exports the primary constant and named types without error.

**Setup:** None. Import the module.

**Steps:**
1. Import `SNARKY_LABELS`, `SnarkyLabel`, `LabelTone` from `lib/content.ts`.

**Assertions:**
- `SNARKY_LABELS` is defined and not null/undefined.
- `typeof SNARKY_LABELS` is `'object'`.
- The import does not throw.

---

### UT-02: `SNARKY_LABELS` contains exactly 14 entries

**Purpose:** Verify the label count matches the spec (AC-1: "all 14 labels").

**Setup:** None.

**Steps:**
1. Import `SNARKY_LABELS`.
2. Count `Object.keys(SNARKY_LABELS).length`.

**Assertions:**
- `Object.keys(SNARKY_LABELS).length === 14`

**Developer trap this catches:** Adding 13 or 15 entries by mistake; missing an entry from the spec.

---

### UT-03 through UT-16: Per-label key lookup and field values

Each of the 14 tests follows the same structure. The expected values come from the canonical table in `reqs-brief.md`.

**Structure for each test:**

**Setup:** Import `SNARKY_LABELS`.

**Steps:**
1. Access `SNARKY_LABELS[key]` where `key` is the label's `UPPER_SNAKE_CASE` identifier.

**Assertions (all three must pass):**
- `SNARKY_LABELS[key]` is defined (key lookup succeeds).
- `SNARKY_LABELS[key].displayText` equals the expected string exactly (case-sensitive).
- `SNARKY_LABELS[key].description` is a non-empty string.
- `SNARKY_LABELS[key].tone` equals the expected tone value exactly.

**Label-by-label expected values:**

| Test ID | key | displayText | tone |
|---|---|---|---|
| UT-03 | `POINT_MACHINE` | `"Point Machine"` | `'positive'` |
| UT-04 | `IRON_CURTAIN` | `"Iron Curtain"` | `'positive'` |
| UT-05 | `ALPHA_DOG` | `"Alpha Dog"` | `'positive'` |
| UT-06 | `LEAGUE_DOORMAT` | `"League Doormat"` | `'sting'` |
| UT-07 | `GLASS_CANNON` | `"Glass Cannon"` | `'sting'` |
| UT-08 | `PAPER_TIGER` | `"Paper Tiger"` | `'sting'` |
| UT-09 | `DRAFT_DAY_GENIUS` | `"Draft Day Genius"` | `'positive'` |
| UT-10 | `WASTED_PICKS` | `"Wasted Picks"` | `'sting'` |
| UT-11 | `ON_FIRE` | `"On Fire"` | `'positive'` |
| UT-12 | `ROCK_BOTTOM` | `"Rock Bottom"` | `'sting'` |
| UT-13 | `MERCY_RULE` | `"Mercy Rule"` | `'positive'` |
| UT-14 | `CARDIAC_CREW` | `"Cardiac Crew"` | `'neutral'` |
| UT-15 | `WHAT_COULDVE_BEEN` | `"What Could've Been"` | `'neutral'` |
| UT-16 | `COACHING_MALPRACTICE` | `"Coaching Malpractice"` | `'sting'` |

**Developer trap these catch:** Wrong tone on `CARDIAC_CREW` or `WHAT_COULDVE_BEEN` (UX spec says "Neutral/fun" which could be misread as `'positive'`); misspelled display text including the apostrophe in "What Could've Been"; wrong tone on `MERCY_RULE` (a blowout win may intuitively feel like `'neutral'` but is specified as `'positive'`).

---

### UT-17: Every label's `key` field matches its map key

**Purpose:** Verify that `entry.key === mapKey` for all entries (no mismatch between the Record key and the stored `key` field).

**Setup:** Import `SNARKY_LABELS`.

**Steps:**
1. Iterate `Object.entries(SNARKY_LABELS)`.
2. For each `[mapKey, entry]`, assert `entry.key === mapKey`.

**Assertions:**
- All 14 entries pass the key-consistency check.

**Developer trap this catches:** Copy-paste errors where the map key is `POINT_MACHINE` but the stored `key` field reads `"IRON_CURTAIN"`.

---

### UT-18: `SNARKY_LABELS` is a plain object (Record), not an array or class instance

**Purpose:** Verify the extensibility requirement — Record map, not fixed-length tuple or class (BR-2).

**Setup:** Import `SNARKY_LABELS`.

**Steps:**
1. Assert `Array.isArray(SNARKY_LABELS)` is `false`.
2. Assert `typeof SNARKY_LABELS === 'object'`.
3. Assert that a new property can be read by key without array indexing: `SNARKY_LABELS['POINT_MACHINE']` returns the entry.

**Assertions:**
- Not an array.
- Key-based access works as a plain object.

---

### UT-19: Module does not import from `lib/playoff-labels.ts`

**Purpose:** Enforce module boundary (BR-3): `lib/content.ts` is a separate domain from playoff labels.

**Setup:** Read the source file `lib/content.ts` as a string.

**Steps:**
1. Read the raw source of `lib/content.ts`.
2. Assert no `import` or `require` statement references `playoff-labels`.

**Assertions:**
- Source does not contain the string `playoff-labels`.

**Developer trap this catches:** A developer who finds `lib/playoff-labels.ts` and tries to extend or re-export from it rather than creating a standalone module.

---

### UT-20: Module does not contain `"use client"` directive

**Purpose:** Enforce the pure data module constraint (BR-6, CLAUDE.md architecture rule).

**Setup:** Read the source file `lib/content.ts` as a string.

**Steps:**
1. Read the raw source of `lib/content.ts`.
2. Assert no occurrence of the string `"use client"` or `'use client'`.

**Assertions:**
- Source does not contain `use client`.

---

### UT-21: Module contains no React imports

**Purpose:** Verify `lib/content.ts` is a pure TypeScript module with no React dependency (reinforces BR-6).

**Setup:** Read the source file `lib/content.ts` as a string.

**Steps:**
1. Read the raw source of `lib/content.ts`.
2. Assert no `import` statement references `'react'` or `"react"`.

**Assertions:**
- Source does not contain an import from `react`.

---

### UT-22: No default export

**Purpose:** Enforce tree-shakeability NFR. Named exports only.

**Setup:** Import the module.

**Steps:**
1. Attempt to import the default export: `import defaultExport from 'lib/content'`.
2. Assert `defaultExport` is `undefined`.

**Alternative approach:** Read source and assert it contains no `export default` statement.

**Assertions:**
- No default export exists.

---

### UT-23: `SNARKY_LABELS` is effectively immutable at runtime

**Purpose:** Enforce the immutability NFR. The `as const` assertion or `Readonly` wrapper should prevent runtime mutation.

**Setup:** Import `SNARKY_LABELS`.

**Steps:**
1. Attempt to assign a new value to a property: `(SNARKY_LABELS as any)['POINT_MACHINE'] = null`.
2. Read back `SNARKY_LABELS['POINT_MACHINE']`.

**Assertions:**
- `SNARKY_LABELS['POINT_MACHINE']` is still the original entry (mutation silently failed, as expected in strict mode with `Object.freeze` or `as const` on a frozen object).

**Note:** TypeScript `as const` does not freeze the object at runtime by default. If the developer uses `Object.freeze`, the assignment throws in strict mode. If not frozen, the test checks that the TypeScript type prevents mutation at compile time (which is tested implicitly by compilation). The test author should document which behavior is expected based on the implementation choice. Either `Object.freeze` (runtime throw) or TypeScript-only readonly (no runtime enforcement) is acceptable per the NFR wording.

---

### UT-24: All `tone` values are members of the valid set

**Purpose:** Verify no label has a tone value outside `'positive' | 'sting' | 'neutral'` — catches typos like `'Positive'` or `'neutral '` with trailing whitespace.

**Setup:** Import `SNARKY_LABELS`.

**Steps:**
1. Collect all `tone` values: `Object.values(SNARKY_LABELS).map(l => l.tone)`.
2. For each tone value, assert it is one of `['positive', 'sting', 'neutral']`.

**Assertions:**
- All 14 tone values are exactly one of the three valid strings.

**Developer trap this catches:** Capitalization errors, trailing spaces, or a fourth tone value introduced by mistake.

---

### UT-25: All `displayText` values are non-empty strings

**Purpose:** Guard against empty or whitespace-only display text.

**Setup:** Import `SNARKY_LABELS`.

**Steps:**
1. Collect all `displayText` values.
2. Assert each is a string with `length > 0` after `.trim()`.

**Assertions:**
- All 14 `displayText` values are non-empty trimmed strings.

---

### UT-26: All `description` values are non-empty strings

**Purpose:** Guard against empty or whitespace-only descriptions. The `description` field is what triggers a label; an empty description violates AC-2.

**Setup:** Import `SNARKY_LABELS`.

**Steps:**
1. Collect all `description` values.
2. Assert each is a string with `length > 0` after `.trim()`.

**Assertions:**
- All 14 `description` values are non-empty trimmed strings.

---

### UT-27: All `key` values use UPPER_SNAKE_CASE format

**Purpose:** Enforce the naming convention from CLAUDE.md (Constants: `UPPER_SNAKE_CASE`).

**Setup:** Import `SNARKY_LABELS`.

**Steps:**
1. Collect all `key` values from the entries.
2. Assert each matches the pattern `/^[A-Z][A-Z0-9_]*$/` (all caps, underscores, no lowercase).

**Assertions:**
- All 14 `key` values match `UPPER_SNAKE_CASE` regex.

---

## What Is NOT Tested

The following concerns are explicitly out of scope for this story's unit tests:

1. **Visual rendering of tone values**: `lib/content.ts` does not render anything. Visual treatment (gold for `'positive'`, etc.) is enforced in consuming component tests (Stories 3.x).
2. **No red/purple accessibility rule (BR-5)**: Enforced at the component layer, not in this module.
3. **WCAG contrast ratios**: Not applicable to a data module.
4. **BR-1 (no hardcoded labels in components)**: This requires a codebase-wide grep audit, appropriate for the Story 10.1 design system audit, not a unit test here.
5. **`lib/playoff-labels.ts` behavior**: Out of scope; different module, different domain.
6. **Database state**: This story has no database interaction. No seed data, no post-test DB assertions.
7. **API endpoint behavior**: No API routes in this story.
8. **E2E browser tests**: No UI rendered by this story.
9. **TypeScript generic type inference correctness beyond compilation**: The test runner validates runtime shape; TypeScript compiler validates type-level correctness during the build step.
