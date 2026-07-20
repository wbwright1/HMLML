/** @deprecated Replaced by components/live-pill.tsx — deleted in Wave 1 (C0 chrome package). */
import { getNflState } from "@/lib/queries/nfl-state";
import { getLatestSeason } from "@/lib/queries/matchups";

type SeasonVariant = "preseason" | "week" | "playoffs" | "offseason";

function getVariantClasses(variant: SeasonVariant): string {
  switch (variant) {
    case "preseason":
    case "week":
      return "bg-accent-green-light text-accent-green";
    case "playoffs":
      return "bg-accent-gold-light text-accent-gold";
    case "offseason":
      return "bg-surface-muted text-text-tertiary";
  }
}

export async function SeasonalPillBadge() {
  let nflState: Awaited<ReturnType<typeof getNflState>> = null;
  let latestSeason: Awaited<ReturnType<typeof getLatestSeason>> = null;

  try {
    [nflState, latestSeason] = await Promise.all([
      getNflState(),
      getLatestSeason(),
    ]);
  } catch {
    return null;
  }

  // Apply the same season detection logic as the hub (page.tsx)
  const nflSeasonType = nflState?.seasonType ?? null;
  const dbSeasonStatus = latestSeason?.status ?? null;

  let label: string;
  let variant: SeasonVariant;

  if (nflSeasonType === "regular") {
    label = `Week ${nflState?.week ?? 1}`;
    variant = "week";
  } else if (nflSeasonType === "post") {
    label = "Playoffs";
    variant = "playoffs";
  } else if (nflSeasonType === "pre") {
    label = "Preseason";
    variant = "preseason";
  } else if (dbSeasonStatus === "in_season") {
    label = "In Season";
    variant = "week";
  } else if (dbSeasonStatus === "pre_draft" || dbSeasonStatus === "complete") {
    label = "Preseason";
    variant = "preseason";
  } else {
    label = "Offseason";
    variant = "offseason";
  }

  const variantClasses = getVariantClasses(variant);

  return (
    <span
      className={`rounded-full px-3 py-1 text-caption uppercase tracking-widest font-medium ${variantClasses}`}
    >
      {label}
    </span>
  );
}
