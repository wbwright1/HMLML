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
        <FranchiseLogo
          slug={franchise.slug}
          name={franchise.name}
          abbreviation={franchise.abbreviation}
          brandingColor={franchise.brandingColor}
          size="sm"
          decorative
        />
        <span className="text-body-sm font-semibold truncate">{franchise.name}</span>
        <ChampionshipStars count={championships} variant="inline" />
      </div>
    );
  }

  if (variant === "hero") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <FranchiseLogo
          slug={franchise.slug}
          name={franchise.name}
          abbreviation={franchise.abbreviation}
          brandingColor={franchise.brandingColor}
          size="xl"
        />
        <div className="space-y-2">
          <h1 className="text-h1 font-bold">{franchise.name}</h1>
          <ChampionshipStars count={championships} variant="hero" />
          {ownerName && (
            <p className="text-body-sm text-muted-foreground">
              Owned by {ownerName}{coOwnerName ? ` & ${coOwnerName}` : ""}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Standard variant
  return (
    <div className="flex items-center gap-3">
      <FranchiseLogo
        slug={franchise.slug}
        name={franchise.name}
        abbreviation={franchise.abbreviation}
        brandingColor={franchise.brandingColor}
        size="md"
        decorative
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-body font-semibold truncate">{franchise.name}</span>
          <ChampionshipStars count={championships} variant="inline" />
        </div>
        {ownerName && (
          <p className="text-caption text-muted-foreground">
            {ownerName}{coOwnerName ? ` & ${coOwnerName}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
