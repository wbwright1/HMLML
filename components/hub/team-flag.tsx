import { FranchiseLogo } from "@/components/franchise-logo";

/** Enough of a franchise for the hub to draw its crest beside its name. */
export interface FlagTeam {
  name: string;
  slug: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
}

/**
 * A franchise on the hub: a 20px crest plus its name, replacing the bare
 * letter codes the hero stat chips and the slate cards used to print (see
 * CLAUDE.md, Franchise Identity Display).
 *
 * The crest is decorative because the name is immediately beside it. Renders a
 * span so it drops into a flex row or an inline run either way; note that it
 * contains a div, so its host must not be a <p>.
 */
export function TeamFlag({
  team,
  compact = false,
}: {
  team: FlagTeam;
  /** Prints the letter code instead of the full name, for a chip naming two teams. */
  compact?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <FranchiseLogo
        slug={team.slug}
        name={team.name}
        abbreviation={team.abbreviation ?? undefined}
        brandingColor={team.brandingColor ?? undefined}
        avatarUrl={team.avatarUrl ?? undefined}
        size={20}
        decorative
      />
      <span className="truncate">
        {compact ? (team.abbreviation ?? team.name) : team.name}
      </span>
    </span>
  );
}
