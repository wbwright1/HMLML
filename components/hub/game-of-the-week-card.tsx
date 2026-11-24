import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";
import { EditorialBody } from "@/components/editorial-emphasis";
import { MonoNums } from "@/components/hub/mono-nums";
import { buttonVariants } from "@/components/ui/button-variants";

export interface GameOfTheWeekTeam {
  name: string;
  slug: string;
  abbreviation: string | null;
  brandingColor: string | null;
  /** Per-season Sleeper crest; null falls back to the monogram. */
  avatarUrl: string | null;
  /** Season record, e.g. "8-2". */
  record: string;
  /** One-line status descriptor, e.g. "1st in Division 1"; null to omit. */
  status: string | null;
}

interface GameOfTheWeekCardProps {
  /** "{lead} · {stakes}" from gotw-context, e.g. "Division 1 rematch ·
   * Division lead on the line", or "The Dead Heat · 2-0 meets 0-2" when a
   * named rivalry leads. The lead renders as the card's gold serif title, the
   * stakes as the caption under it. */
  kicker: string;
  /** The named rivalry leading the kicker, stamped as data-named-rivalry. */
  rivalryName?: string | null;
  /** A named rivalry's tagline, printed under the title. */
  rivalryTagline?: string | null;
  /** Top-right all-time series line, e.g. "All-time GW leads 14-9". */
  h2hLine: string;
  teamA: GameOfTheWeekTeam;
  teamB: GameOfTheWeekTeam;
  /** The trash-laced angle under the hairline. */
  blurb: string;
  /** The Book's line for this game ("BH -53.5 · ML -900/+565"), or null when
   * it has no priced line. With it comes the "See lines" link into The Book. */
  bookLine?: string | null;
}

/**
 * Signature feature card for the between-weeks hub (state 1d): the marquee
 * matchup of the upcoming week. Gold-tinted card with the ambient gold blob,
 * the gold serif title (the rivalry or game name), two teams, the all-time
 * series, the angle, and The Book's line. Upright serif for the title only;
 * everything under 24px is Geist, numerals mono. Server component.
 */
export function GameOfTheWeekCard({
  kicker,
  rivalryName,
  rivalryTagline,
  h2hLine,
  teamA,
  teamB,
  blurb,
  bookLine = null,
}: GameOfTheWeekCardProps) {
  const split = kicker.indexOf(" · ");
  const lead = split >= 0 ? kicker.slice(0, split) : kicker;
  const stakes = split >= 0 ? kicker.slice(split + 3) : "";

  return (
    <div className="card-surface card-tint-gold card-glows p-6 md:p-8">
      <div className="relative">
        {/* Header: title + stakes, all-time series on the right */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div
            data-testid="gotw-kicker"
            data-kicker={kicker}
            data-named-rivalry={rivalryName ?? undefined}
            className="min-w-0"
          >
            <h3 className="font-serif text-h2 text-accent-gold" data-testid="gotw-title">
              <MonoNums text={lead} />
            </h3>
            {stakes && (
              <p className="mt-1 text-body-sm text-text-secondary" data-testid="gotw-stakes">
                <MonoNums text={stakes} />
              </p>
            )}
          </div>
          <p className="text-caption text-text-tertiary">
            <MonoNums text={h2hLine} />
          </p>
        </div>
        {rivalryTagline && (
          <p
            className="mt-2 text-body-sm text-text-secondary"
            data-testid="gotw-rivalry-tagline"
          >
            <MonoNums text={rivalryTagline} />
          </p>
        )}

        {/* Teams */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <TeamSide team={teamA} />
          <p className="text-body text-text-tertiary sm:text-center">vs</p>
          <TeamSide team={teamB} mirrored />
        </div>

        {/* Blurb under a hairline */}
        <hr className="mt-6 border-divider" />
        <p className="mt-4 text-body text-text-secondary" data-testid="gotw-blurb">
          <EditorialBody body={blurb} />
        </p>

        {bookLine && (
          <div
            data-testid="gotw-book"
            className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
          >
            <span className="text-caption text-text-secondary">
              <MonoNums text={bookLine} />
            </span>
            <Link
              href="/book"
              className={`${buttonVariants({ variant: "quiet", size: "sm" })} -mr-3`}
            >
              See lines
              <ChevronRight aria-hidden="true" strokeWidth={2} data-icon="inline-end" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamSide({ team, mirrored = false }: { team: GameOfTheWeekTeam; mirrored?: boolean }) {
  return (
    <div className={`min-w-0 ${mirrored ? "sm:text-right" : ""}`.trim()}>
      {/* ONE link over crest and name, not two to the same place. The record
          line below stays outside it. */}
      <TeamLink
        slug={team.slug}
        className={`flex min-h-11 min-w-0 items-center gap-3 text-text-primary ${
          mirrored ? "sm:flex-row-reverse" : ""
        }`.trim()}
      >
        <FranchiseLogo
          slug={team.slug}
          name={team.name}
          abbreviation={team.abbreviation ?? undefined}
          brandingColor={team.brandingColor ?? undefined}
          avatarUrl={team.avatarUrl}
          size="lg"
          decorative
        />
        <span className="min-w-0 truncate text-h3 font-semibold">{team.name}</span>
      </TeamLink>
      <p className="mt-1 text-body-sm text-text-tertiary">
        <span className="text-stat tabular-nums">{team.record}</span>
        {team.status && (
          <span>
            {" "}
            &middot; <MonoNums text={team.status} />
          </span>
        )}
      </p>
    </div>
  );
}
