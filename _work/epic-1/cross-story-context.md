# Epic 1: Project Foundation & Design System — Cross-Story Context

## Epic Goal
Establish the project scaffolding, implement the Press Box Evolved design token system, and build all core layout and utility components that every other epic depends on.

## Story Dependencies
- Story 1.1 (Scaffolding) must complete before all others can be built
- Stories 1.2-1.5 are independent of each other and can develop in parallel after 1.1
- Story 1.2 (Theme) should ideally complete before 1.3 (Layout) since layout components use theme tokens

## Decisions & Patterns

### Story 1.2: Press Box Evolved Theme Token System

**Verified WCAG Contrast Ratios (foreground on --canvas #FAF8F5):**

| Token | Hex | Ratio | Meets 4.5:1 (body) | Meets 3:1 (large/bold) |
|---|---|---|---|---|
| `--text-primary` | `#1A1A1A` | 16.42:1 | Yes | Yes |
| `--text-secondary` | `#4A4540` | 8.94:1 | Yes | Yes |
| `--accent-green` | `#2D5A3D` | 7.50:1 | Yes | Yes |
| `--text-tertiary` | `#7A756F` | 4.31:1 | No (below 4.5:1) | Yes |
| `--text-muted` | `#9C9590` | 2.78:1 | No | No (below 3:1) |

**Usage Restrictions:**

- `--text-tertiary` (`#7A756F`): At 4.31:1, this token fails the 4.5:1 threshold for normal body text (16px, Regular 400). It MUST be restricted to: Caption (12px, Medium 500), Body Small (14px) contexts, or large/bold text (18px+ or 14px+ bold) where the 3:1 large-text exemption applies. Do not use for Body (16px, Regular) or larger regular-weight text.
- `--text-muted` (`#9C9590`): At 2.78:1, this token fails both the 4.5:1 body text and the 3:1 large text thresholds. It MUST be restricted to: decorative and non-informational contexts only (placeholder text in empty input fields, disabled state indicators that have a separate visual treatment). It must never be the sole conveyance of information.

**Tailwind v4 Spacing Token Class Generation:**

Spacing tokens registered as `--spacing-space-N` in `@theme inline` generate utility classes as `p-space-N`, `m-space-N`, `gap-space-N`, etc. This is confirmed working in Tailwind v4. For example, `--spacing-space-4: 1rem` generates `p-space-4` which resolves to `padding: 1rem` (16px). Downstream stories should use these classes for the 8px-multiple spacing system.

**Color Token Tailwind Utility Classes:**

Color tokens registered as `--color-<name>` generate classes like `bg-canvas`, `text-text-primary`, `border-border-strong`, etc. The doubled-word pattern (e.g., `text-text-primary`) is intentional and correct for Tailwind v4 tokens with a `text-` prefix in the name.

**Single Source of Truth (BR-1):**

Each hex value is defined exactly once in `:root` as a named semantic token. All shadcn/ui aliases use `var()` references to these tokens. No hex value is duplicated in `globals.css`.

**Unchanged shadcn/ui Properties:**

The following properties were deliberately NOT changed:
- `--muted-foreground`: remains `#6B6560` (for shadcn/ui component compatibility)
- `--loss`: remains `#C4402F` (shadcn/ui destructive-adjacent alias)
- `--destructive`: remains `#B91C1C` (shadcn/ui internal)

Components should use `--accent-warm` (`#C45D3E`) for HML negative states, not `--loss`.
