import { FranchiseLogo } from "@/components/franchise-logo";
import type { FieldDivision, FieldTeamEntry } from "@/lib/queries/preseason-field";

interface DivisionFieldCardProps {
  division: FieldDivision;
  /** Serif one-liner shown right of the division name. */
  characterization: string;
  /** Serif rivalry note pinned to the bottom of the card. */
  rivalryNote: string;
}

function TagOrRecord({ team }: { team: FieldTeamEntry }) {
  if (team.tag === "CHAMP" || team.tag === "R-UP") {
    return (
      <span className="text-caption font-semibold text-accent-gold shrink-0">
        {team.tag}
      </span>
    );
  }
  if (team.tag === "DOORMAT") {
    return (
      <span className="text-caption font-semibold text-accent-warm shrink-0">
        DOORMAT
      </span>
    );
  }
  if (team.recordLabel) {
    return (
      <span className="text-stat text-body-sm text-text-tertiary shrink-0 tabular-nums">
        {team.recordLabel}
      </span>
    );
  }
  return (
    <span className="text-caption text-text-tertiary shrink-0">1ST YR</span>
  );
}

/**
 * One division's slice of "The Field": a header (name + serif characterization),
 * its franchises with last-season record or a CHAMP / R-UP / DOORMAT tag, and a
 * serif rivalry note pinned to the bottom. Server component, zero client JS.
 */
export function DivisionFieldCard({
  division,
  characterization,
  rivalryNote,
}: DivisionFieldCardProps) {
  return (
    <div className="card-surface flex h-full flex-col p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-body-lg font-semibold text-text-primary">
          {division.divisionName}
        </h3>
        <span className="font-serif italic text-body-sm text-accent-gold text-right">
          {characterization}
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {division.teams.map((team) => (
          <li key={team.franchiseId} className="flex items-center gap-3">
            <FranchiseLogo
              slug={team.slug}
              name={team.name}
              abbreviation={team.abbreviation ?? undefined}
              brandingColor={team.brandingColor ?? undefined}
              avatarUrl={team.avatarUrl}
              size="sm"
              decorative
            />
            <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-text-primary">
              {team.name}
            </span>
            <TagOrRecord team={team} />
          </li>
        ))}
      </ul>

      <div className="mt-auto border-t border-divider pt-4">
        <p className="font-serif italic text-body-sm text-text-tertiary">
          {rivalryNote}
        </p>
      </div>
    </div>
  );
}
