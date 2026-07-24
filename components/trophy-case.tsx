import Link from "next/link";
import { PlayerHeadshot } from "@/components/player-headshot";
import { FranchiseLogo } from "@/components/franchise-logo";
import { getAwardsHonorRoll, type AwardEntry } from "@/lib/queries/awards";
import { AWARD_METADATA } from "@/lib/awards";
import { getAwardTypeIcon } from "@/lib/award-icons";

/** Small franchise crest chip linking to the franchise page. */
function FranchiseCrestChip({ franchise }: { franchise: NonNullable<AwardEntry["franchise"]> }) {
  return (
    <Link
      href={`/teams/${franchise.slug}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2 py-1 text-caption text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
    >
      <FranchiseLogo
        slug={franchise.slug}
        name={franchise.name}
        abbreviation={franchise.abbreviation ?? undefined}
        brandingColor={franchise.brandingColor ?? undefined}
        avatarUrl={franchise.avatarUrl}
        size={18}
        decorative
      />
      <span className="max-w-[9rem] truncate normal-case tracking-normal">
        {franchise.name}
      </span>
    </Link>
  );
}

function AwardRow({
  award,
  repeatCount,
  highlight,
}: {
  award: AwardEntry;
  repeatCount: number;
  highlight: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[10px] border p-3 ${
        highlight
          ? "border-accent-gold/25 bg-accent-gold-light"
          : "border-transparent"
      }`}
    >
      <span className="w-9 shrink-0 font-mono text-body-sm font-bold tabular-nums text-accent-gold">
        {String(award.seasonYear).slice(-2)}
        <span className="text-[10px] text-text-tertiary">&rsquo;</span>
      </span>
      <PlayerHeadshot
        playerId={award.playerId}
        name={award.playerName}
        size={40}
        showTeamBadge={false}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-body-sm font-semibold text-text-primary">
            {award.playerName}
          </p>
          {repeatCount > 1 && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-accent-gold-light px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-accent-gold">
              {repeatCount}x
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          {award.position && (
            <span className="text-caption text-text-tertiary">{award.position}</span>
          )}
          {award.franchise ? (
            <FranchiseCrestChip franchise={award.franchise} />
          ) : (
            <span className="text-caption text-text-muted normal-case tracking-normal">
              Franchise unknown
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The Trophy Case: the "Yearly Hardware" subsection of the Player Wing
 * module, surfacing every league award (Regular Season MVP, Championship
 * MVP, Rookie of the Year) in three columns. Self-fetching async RSC;
 * renders NOTHING when no awards exist (empty table or pre-migration), so
 * the page never shows an empty shell.
 */
export async function TrophyCase() {
  const roll = await getAwardsHonorRoll();
  if (roll.total === 0 || roll.groups.length === 0) return null;

  return (
    <div data-testid="trophy-case" className="space-y-3">
      <div className="pb-1">
        <p className="text-kicker text-accent-gold mb-1.5">Yearly Hardware</p>
        <h3 className="text-h3 text-text-primary">The Trophy Case</h3>
        <p className="text-body-sm text-text-tertiary mt-1">
          Every MVP, Finals MVP, and Rookie of the Year, and the roster that
          cashed the ticket.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {roll.groups.map((group) => {
          const meta = AWARD_METADATA[group.awardType];
          return (
            <div key={group.awardType} className="card-surface p-5">
              <p className="text-kicker text-accent-gold mb-3 flex items-center gap-1.5">
                {getAwardTypeIcon(group.awardType)}
                {meta.label}
              </p>
              <div className="space-y-2">
                {group.awards.map((award) => (
                  <AwardRow
                    key={award.id}
                    award={award}
                    repeatCount={
                      award.playerId
                        ? (roll.awardCountByPlayer[award.playerId] ?? 1)
                        : 1
                    }
                    highlight={
                      !!award.playerId &&
                      award.playerId === roll.mostDecoratedPlayerId
                    }
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
