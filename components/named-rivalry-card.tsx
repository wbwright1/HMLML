import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import {
  formatSeriesRecord,
  seriesStanding,
  type RivalryLore,
  type SeriesRecord,
} from "@/lib/rivalry-display";

export interface NamedRivalryCardTeam {
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  avatarUrl: string | null;
}

interface NamedRivalryCardProps {
  lore: RivalryLore;
  teamA: NamedRivalryCardTeam;
  teamB: NamedRivalryCardTeam;
  /** All-time record from teamA's side; null when they have never met. */
  record: SeriesRecord | null;
  /** Heading level for the rivalry name; the card's section decides. */
  headingLevel?: "h2" | "h3";
}

/**
 * Signature card for one commissioner-named rivalry: the name in gold serif,
 * the tagline, both crests with their names, the all-time series in mono, the
 * origin lore, and a door to the full head-to-head. Self-contained on purpose,
 * so a screenshot of it lands in the group chat with no explanation.
 */
export function NamedRivalryCard({
  lore,
  teamA,
  teamB,
  record,
  headingLevel = "h3",
}: NamedRivalryCardProps) {
  const Heading = headingLevel;
  const standing = seriesStanding(record);
  const h2hHref = `/records/head-to-head?a=${teamA.slug}&b=${teamB.slug}`;

  return (
    <article
      data-testid="named-rivalry-card"
      className="card-surface card-glows relative overflow-hidden px-5 py-6 md:px-7"
    >
      <div className="relative space-y-5">
        <div className="space-y-2">
          <div className="text-kicker">
            Named Rivalry
            {lore.originYear != null && (
              <>
                {" "}&middot; Since{" "}
                <span className="font-mono tabular-nums">{lore.originYear}</span>
              </>
            )}
          </div>
          <Heading className="font-serif text-h2 italic text-accent-gold">
            {lore.name}
          </Heading>
          {lore.tagline && (
            <p className="font-serif text-body-lg italic text-text-secondary">
              {lore.tagline}
            </p>
          )}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <CardSide team={teamA} align="start" />
          <div className="flex flex-col items-center gap-1 text-center">
            {record && standing !== "unplayed" ? (
              <>
                <span className="font-mono text-h3 font-bold tabular-nums text-text-primary">
                  {formatSeriesRecord(record)}
                </span>
                <span className="text-caption text-text-tertiary">
                  {standing === "tied" ? "All square" : "All-time"}
                </span>
              </>
            ) : (
              <span className="text-caption text-text-tertiary">
                No meetings yet
              </span>
            )}
          </div>
          <CardSide team={teamB} align="end" />
        </div>

        {record && standing !== "unplayed" && (
          <div className="text-body-sm text-text-secondary">
            {standing === "tied" ? (
              <>
                Dead even after{" "}
                <span className="font-mono tabular-nums">{record.totalGames}</span>{" "}
                meeting{record.totalGames !== 1 ? "s" : ""}.
              </>
            ) : (
              <>
                {standing === "leads" ? teamA.name : teamB.name} holds the series,{" "}
                <span className="font-mono tabular-nums">
                  {Math.max(record.wins, record.losses)}-{Math.min(record.wins, record.losses)}
                </span>
                .
              </>
            )}
          </div>
        )}

        {lore.origin && (
          <p className="font-serif text-body italic text-text-tertiary">
            {lore.origin}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
          {lore.trophyName ? (
            <span className="text-caption text-text-tertiary">
              Playing for{" "}
              <span className="text-accent-gold">{lore.trophyName}</span>
            </span>
          ) : (
            <span />
          )}
          <Link
            href={h2hHref}
            className="text-body-sm font-medium text-accent-gold transition-colors hover:text-text-primary"
          >
            Full head-to-head
          </Link>
        </div>
      </div>
    </article>
  );
}

function CardSide({
  team,
  align,
}: {
  team: NamedRivalryCardTeam;
  align: "start" | "end";
}) {
  return (
    // Phones stack the crest over a wrapping name; wider screens sit them in
    // a row, so a long franchise name is never cut to "Real Olav...".
    <div
      className={`flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2 ${
        align === "end"
          ? "items-end text-right sm:flex-row-reverse"
          : "items-start"
      }`}
    >
      {/* Named, not decorative: the card is a screenshot unit and the crest
          is announced as the franchise it stands for. */}
      <FranchiseLogo
        slug={team.slug}
        name={team.name}
        abbreviation={team.abbreviation}
        brandingColor={team.brandingColor}
        avatarUrl={team.avatarUrl}
        size={28}
      />
      <span className="min-w-0 break-words text-body-sm font-semibold text-text-primary sm:truncate">
        {team.name}
      </span>
    </div>
  );
}
