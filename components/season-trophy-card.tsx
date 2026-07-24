import Link from "next/link";
import { FranchiseIdentity } from "@/components/franchise-identity";
import { SuperlativeBadge } from "@/components/superlative-badge";
import type { TrophyEntry } from "@/lib/queries/records";

interface SeasonTrophyCardProps {
  trophy: TrophyEntry;
  championships: number;
}

export function SeasonTrophyCard({
  trophy,
  championships,
}: SeasonTrophyCardProps) {
  return (
    <div className="card-surface card-tint-gold flex h-full flex-col p-5 space-y-4">
      <Link
        href={`/seasons/${trophy.seasonYear}`}
        className="text-h3 font-mono tabular-nums hover:text-accent-gold transition-colors"
      >
        {trophy.seasonYear}
      </Link>

      <div className="space-y-2">
        <Link
          href={trophy.championSlug ? `/teams/${trophy.championSlug}` : "#"}
          className="block hover:opacity-80 transition-opacity"
        >
          <FranchiseIdentity
            franchise={{
              slug: trophy.championSlug ?? "",
              name: trophy.championName ?? "",
              abbreviation: trophy.championAbbreviation ?? undefined,
              brandingColor: trophy.championBrandingColor ?? undefined,
              avatarUrl: trophy.championAvatarUrl,
            }}
            championships={championships}
            variant="compact"
          />
        </Link>
        <SuperlativeBadge text="League Champion" variant="gold" />
        {trophy.runnerUpName && (
          <p className="text-body-sm text-text-tertiary">
            def.{" "}
            {trophy.runnerUpSlug ? (
              <Link
                href={`/teams/${trophy.runnerUpSlug}`}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                {trophy.runnerUpName}
              </Link>
            ) : (
              trophy.runnerUpName
            )}{" "}
            &middot; Runner-Up
          </p>
        )}
      </div>
    </div>
  );
}
