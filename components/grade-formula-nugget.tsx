const FORMULA_LENSES = [
  {
    weight: "45%",
    label: "Points on the field",
    descriptor:
      "What your haul actually scored for you. Flipped picks follow the chain.",
  },
  {
    weight: "35%",
    label: "Market says",
    descriptor:
      "What those assets are worth today, per FantasyCalc's dynasty market.",
  },
  {
    weight: "20%",
    label: "Wins swung",
    descriptor:
      "Games you won that flip to losses without them. Playoff swings count double.",
  },
] as const;

export function GradeFormulaNugget() {
  return (
    <aside
      aria-label="How grades are computed"
      className="card-surface p-5 space-y-4 lg:w-[360px] lg:shrink-0"
    >
      <p className="text-kicker text-text-tertiary">The Formula</p>

      <ul className="space-y-3">
        {FORMULA_LENSES.map((lens) => (
          <li key={lens.label} className="flex items-start gap-3">
            <span className="font-mono tabular-nums font-bold text-accent-gold text-body-lg w-12 shrink-0">
              {lens.weight}
            </span>
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text-primary">
                {lens.label}
              </p>
              <p className="text-body-sm text-text-tertiary">
                {lens.descriptor}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-caption text-text-muted normal-case tracking-normal border-t border-divider pt-3">
        No projections. Grades print after six games of receipts or a year,
        and sharpen as the story does.
      </p>
    </aside>
  );
}
