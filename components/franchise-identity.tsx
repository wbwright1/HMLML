import { FranchiseLogo } from "@/components/franchise-logo";
import { ChampionshipStars } from "@/components/championship-stars";

interface FranchiseIdentityProps {
  franchise: {
    slug: string;
    name: string;
    abbreviation?: string;
    brandingColor?: string;
  };
  championships?: number;
  ownerName?: string;
  coOwnerName?: string;
  variant?: "compact" | "standard" | "hero";
}

// Mirrors FranchiseLogo's internal crest radius formula (components/franchise-logo.tsx
// is frozen, so this stays in sync by convention: radius = 28% of crest size).
const CREST_PX = { sm: 32, md: 48, lg: 64, xl: 96 } as const;
type CrestSize = keyof typeof CREST_PX;

function crestRingRadius(size: CrestSize): string {
  return `${Math.round(CREST_PX[size] * 0.28)}px`;
}

/** Wraps FranchiseLogo with a subtle brandingColor ring — the sole surviving use
 * of a franchise's brandingColor now that the full-bleed hero gradient is gone. */
function BrandedCrest({
  franchise,
  size,
}: {
  franchise: FranchiseIdentityProps["franchise"];
  size: CrestSize;
}) {
  return (
    <div
      className="shrink-0"
      data-branding={franchise.brandingColor ? "true" : "false"}
      style={
        franchise.brandingColor
          ? {
              boxShadow: `0 0 0 2px ${franchise.brandingColor}`,
              borderRadius: crestRingRadius(size),
            }
          : undefined
      }
    >
      <FranchiseLogo
        slug={franchise.slug}
        name={franchise.name}
        abbreviation={franchise.abbreviation}
        brandingColor={franchise.brandingColor}
        size={size}
        decorative
      />
    </div>
  );
}

export function FranchiseIdentity({
  franchise,
  championships = 0,
  ownerName,
  coOwnerName,
  variant = "standard",
}: FranchiseIdentityProps) {
  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2">
        <BrandedCrest franchise={franchise} size="sm" />
        <span className="text-body-sm font-semibold text-text-primary truncate">
          {franchise.name}
        </span>
        <ChampionshipStars count={championships} variant="inline" />
      </div>
    );
  }

  if (variant === "hero") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandedCrest franchise={franchise} size="xl" />
        <div className="space-y-2">
          <h1 className="text-h1">{franchise.name}</h1>
          <ChampionshipStars count={championships} variant="hero" />
          {ownerName && (
            <p className="text-body-sm text-muted-foreground">
              Owned by {ownerName}
              {coOwnerName ? ` & ${coOwnerName}` : ""}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Standard variant
  return (
    <div className="flex items-center gap-3">
      <BrandedCrest franchise={franchise} size="md" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-serif italic text-lg text-text-primary truncate">
            {franchise.name}
          </span>
          <ChampionshipStars count={championships} variant="inline" />
        </div>
        {ownerName && (
          <p className="text-caption text-muted-foreground">
            {ownerName}
            {coOwnerName ? ` & ${coOwnerName}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
