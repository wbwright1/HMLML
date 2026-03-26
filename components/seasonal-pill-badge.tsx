type SeasonVariant = "preseason" | "week" | "playoffs" | "offseason";

interface NflState {
  seasonType: string;
  week: number;
}

/**
 * Returns the current NFL calendar state.
 *
 * Currently returns null for ALL states because the seasons table only stores
 * Sleeper league lifecycle status (pre_draft, in_season, complete), not NFL
 * calendar state (pre, regular, post, off). These are different concepts.
 * Epic 2 will introduce an NFL state data source with actual season_type
 * and week columns. Until then, returning null is the correct fallback
 * per UXA decision #3.
 */
async function getCurrentNflState(): Promise<NflState | null> {
  // Epic 2 will provide an NFL state table with season_type and week columns.
  // Until that data source exists, return null to avoid displaying incorrect
  // season state derived from Sleeper league lifecycle status.
  return null;
}

function getVariantClasses(variant: SeasonVariant): string {
  switch (variant) {
    case "preseason":
    case "week":
      return "bg-primary/10 text-primary";
    case "playoffs":
      return "bg-[#FEF9EC] text-[#B8860B]";
    case "offseason":
      return "bg-muted text-muted-foreground";
  }
}

function getLabel(state: NflState): { label: string; variant: SeasonVariant } | null {
  switch (state.seasonType) {
    case "pre":
      return { label: "Preseason", variant: "preseason" };
    case "regular":
      return { label: `Week ${state.week}`, variant: "week" };
    case "post":
      return { label: "Playoffs", variant: "playoffs" };
    case "off":
      return { label: "Offseason", variant: "offseason" };
    default:
      return null;
  }
}

export async function SeasonalPillBadge() {
  const state = await getCurrentNflState();

  if (!state) return null;

  const result = getLabel(state);
  if (!result) return null;

  const { label, variant } = result;
  const variantClasses = getVariantClasses(variant);

  return (
    <span
      className={`rounded-full px-3 py-1 text-caption uppercase tracking-widest font-medium ${variantClasses}`}
    >
      {label}
    </span>
  );
}
