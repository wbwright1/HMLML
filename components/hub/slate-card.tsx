import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { HUB_ROW_LINK } from "@/components/hub/rail-card";
import { MonoNums } from "@/components/hub/mono-nums";
import type { FlagTeam } from "@/components/hub/team-flag";

export interface SlateSide extends FlagTeam {
  /** This side's spread as The Book prices it ("-20.5", "+20.5"); null when
   * the game has no priced line (genuinely optional data). */
  line: string | null;
}

interface SlateCardProps {
  teamA: SlateSide;
  teamB: SlateSide;
  /** One-line angle for the matchup (series, last meeting, a projected star). */
  angle: string;
}

/**
 * One compact row in the between-weeks hub's "Rest of the slate" list: both
 * teams with their Book line, the angle under them, and a ChevronRight. The
 * WHOLE row is one link into The Book (Fitts: the old cards' only way in was
 * a small "Pick" text link at the far right). Team names are therefore plain
 * text here, not TeamLinks: a link cannot nest inside a link. Letters are
 * Geist and every numeral is mono. Server component.
 */
export function SlateCard({ teamA, teamB, angle }: SlateCardProps) {
  return (
    <Link
      href="/book"
      data-testid="slate-card"
      data-team-slugs={`${teamA.slug} ${teamB.slug}`}
      className={`${HUB_ROW_LINK} items-start`}
    >
      <span className="min-w-0 flex-1 space-y-1.5">
        <SideLine team={teamA} />
        <SideLine team={teamB} />
        <span
          data-testid="slate-angle"
          className="block pt-0.5 text-body-sm text-text-secondary"
        >
          <MonoNums text={angle} />
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        strokeWidth={2}
        className="mt-0.5 size-4 shrink-0 self-center text-text-tertiary"
      />
    </Link>
  );
}

function SideLine({ team }: { team: SlateSide }) {
  return (
    <span className="flex items-center gap-2 text-body-sm font-semibold text-text-primary">
      <FranchiseLogo
        slug={team.slug}
        name={team.name}
        abbreviation={team.abbreviation ?? undefined}
        brandingColor={team.brandingColor ?? undefined}
        avatarUrl={team.avatarUrl ?? undefined}
        size={20}
        decorative
      />
      <span className="min-w-0 truncate">{team.name}</span>
      {team.line && (
        <span
          data-testid="slate-line"
          className="ml-auto shrink-0 font-mono tabular-nums font-normal text-text-secondary"
        >
          {team.line}
        </span>
      )}
    </span>
  );
}
