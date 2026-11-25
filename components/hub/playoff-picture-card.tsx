import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { FranchiseLogo } from "@/components/franchise-logo";
import { buttonVariants } from "@/components/ui/button-variants";
import { HubSection } from "@/components/hub/rail-card";
import type { PlayoffRaceTag } from "@/lib/queries/playoff-race";
import type {
  PlayoffPicture,
  PlayoffPictureTeam,
} from "@/lib/queries/playoff-picture";

const ROW =
  "flex min-h-[52px] items-center gap-3 px-4 py-2 transition-[background-color,scale] duration-150 hover:bg-surface-muted active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

const TAG_LABEL: Record<PlayoffRaceTag, string> = {
  clinched: "Clinched",
  eliminated: "Eliminated",
  "win-and-in": "Win and in",
};

function record(t: PlayoffPictureTeam): string {
  return `${t.wins}-${t.losses}${t.ties > 0 ? `-${t.ties}` : ""}`;
}

/** A fact chip: color always comes with a word (never color alone). */
function TagChip({ tag }: { tag: PlayoffRaceTag }) {
  const tone =
    tag === "clinched"
      ? "border-accent-green/40 text-accent-green"
      : tag === "eliminated"
        ? "border-accent-warm/40 text-accent-warm"
        : "border-accent-gold/40 text-accent-gold";
  return (
    <span
      data-testid="race-tag"
      className={`inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-caption font-semibold ${tone}`}
    >
      {TAG_LABEL[tag]}
    </span>
  );
}

function TeamCell({ team, sub }: { team: PlayoffPictureTeam; sub?: string }) {
  return (
    <>
      <FranchiseLogo
        slug={team.slug}
        name={team.name}
        abbreviation={team.abbreviation ?? undefined}
        brandingColor={team.brandingColor ?? undefined}
        avatarUrl={team.avatarUrl}
        size={28}
        decorative
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-semibold text-text-primary">
          {team.name}
        </span>
        {sub && <span className="block text-caption text-text-tertiary">{sub}</span>}
      </span>
    </>
  );
}

/**
 * The midseason hub's lead module (week 8 to the end of the regular season):
 * the projected playoff field on top, the rookie draft order if the season
 * ended today below. Server component; every row links to its franchise.
 */
export function PlayoffPictureCard({ picture }: { picture: PlayoffPicture }) {
  const { field, firstOut, draftWatch, bracketPicks } = picture;
  return (
    <HubSection
      kicker="Playoff picture"
      action={
        <Link
          href="/records"
          className={`${buttonVariants({ variant: "quiet", size: "sm" })} -mr-3`}
        >
          Standings
          <ChevronRight aria-hidden="true" strokeWidth={2} data-icon="inline-end" />
        </Link>
      }
    >
      <div data-testid="playoff-picture" className="card-surface overflow-hidden">
        {/* Top half: the projected field */}
        <div className="px-4 pt-4 pb-1">
          <h3 className="text-body font-semibold text-text-primary">If the season ended today</h3>
          <p className="text-caption text-text-tertiary">Projected playoff field, by seed</p>
        </div>
        <ol data-testid="playoff-field" className="divide-y divide-divider">
          {field.map((t) => (
            <li key={t.franchiseId}>
              <Link href={`/teams/${t.slug}`} className={ROW}>
                <span
                  className={`w-6 shrink-0 text-center font-mono text-body-sm font-bold tabular-nums ${
                    t.seed === 1 ? "text-accent-gold" : "text-text-secondary"
                  }`}
                >
                  {t.seed}
                </span>
                <TeamCell team={t} sub={t.isDivisionWinner ? "Division leader" : "Wild card"} />
                {t.tag && <TagChip tag={t.tag} />}
                <span className="shrink-0 font-mono text-body-sm tabular-nums text-text-secondary">
                  {record(t)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
        {firstOut && (
          <div className="border-t border-dashed border-border-strong">
            <Link href={`/teams/${firstOut.slug}`} className={ROW} data-testid="playoff-first-out">
              <span className="w-6 shrink-0" aria-hidden="true" />
              <TeamCell team={firstOut} sub="First team out" />
              {firstOut.tag && <TagChip tag={firstOut.tag} />}
              <span className="shrink-0 font-mono text-body-sm tabular-nums text-text-secondary">
                {record(firstOut)}
              </span>
            </Link>
          </div>
        )}

        {/* Bottom half: the draft order watch */}
        {draftWatch.length > 0 && (
          <div className="border-t border-border">
            <div className="px-4 pt-4 pb-1">
              <h3 className="text-body font-semibold text-text-primary">Draft order watch</h3>
              <p className="text-caption text-text-tertiary">
                First-round picks if the season ended today: non-playoff slots, lowest Max PF first, shown with who owns each pick
              </p>
            </div>
            <ol data-testid="draft-watch" className="divide-y divide-divider">
              {draftWatch.map((t) => (
                <li key={t.franchiseId} data-traded={t.owner ? "true" : "false"} data-original-slug={t.slug}>
                  {/* The pick's owner leads; a traded pick names its original
                      slot ("via ..."), whose record and Max PF set the pick. */}
                  <Link href={`/teams/${(t.owner ?? t).slug}`} className={ROW}>
                    <span className="w-6 shrink-0 text-center font-mono text-body-sm font-bold tabular-nums text-text-secondary">
                      {t.pick}
                    </span>
                    <TeamCell
                      team={t.owner ?? t}
                      sub={t.owner ? `via ${t.name} (${record(t)})` : record(t)}
                    />
                    {t.tag === "eliminated" && <TagChip tag={t.tag} />}
                    <span className="shrink-0 text-right text-caption text-text-tertiary">
                      <span className="block font-mono text-body-sm tabular-nums text-text-secondary">
                        {t.maxPointsFor != null
                          ? t.maxPointsFor.toLocaleString("en-US", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })
                          : "-"}
                      </span>
                      Max PF
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            {bracketPicks && (
              <p className="px-4 py-3 text-caption text-text-tertiary" data-testid="draft-watch-bracket">
                Picks <span className="font-mono tabular-nums">{bracketPicks.from}</span>
                {" to "}
                <span className="font-mono tabular-nums">{bracketPicks.to}</span> are set by the playoff bracket.
              </p>
            )}
          </div>
        )}
      </div>
    </HubSection>
  );
}
