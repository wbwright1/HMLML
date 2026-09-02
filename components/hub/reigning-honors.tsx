import Link from "next/link";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerLink } from "@/components/player-link";
import { TeamLink } from "@/components/team-link";
import { getSeasonAwards, type AwardEntry } from "@/lib/queries/awards";
import { AWARD_METADATA } from "@/lib/awards";
import { getAwardTypeIcon } from "@/lib/award-icons";

/**
 * One award card. The card itself is NOT a link: its subject is the winning
 * player, and wrapping the whole thing in a team link buried the player where
 * nothing could reach them. Two sibling links instead, no nesting: the
 * headshot and name go to the player, the franchise line goes to the team.
 */
function HonorCard({ award }: { award: AwardEntry }) {
  const meta = AWARD_METADATA[award.awardType];
  return (
    <div className="card-surface card-tint-gold p-4">
      <p className="text-kicker text-accent-gold mb-2 flex items-center gap-1.5">
        {getAwardTypeIcon(award.awardType)}
        {meta?.shortLabel ?? award.awardType}
      </p>
      <div className="flex items-center gap-3">
        <PlayerLink
          playerId={award.playerId}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <PlayerHeadshot
            playerId={award.playerId}
            name={award.playerName}
            size={44}
            franchiseBadge={
              award.franchise
                ? {
                    slug: award.franchise.slug,
                    name: award.franchise.name,
                    abbreviation: award.franchise.abbreviation,
                    brandingColor: award.franchise.brandingColor,
                    avatarUrl: award.franchise.avatarUrl,
                  }
                : null
            }
          />
          <p className="min-w-0 truncate text-body-sm font-semibold text-text-primary">
            {award.playerName}
          </p>
        </PlayerLink>
      </div>
      <div className="mt-1.5 truncate text-caption text-text-tertiary normal-case tracking-normal">
        <TeamLink slug={award.franchise?.slug}>
          {award.franchise?.name ?? "Franchise unknown"}
        </TeamLink>
      </div>
    </div>
  );
}

/**
 * "Reigning Honors": the just-completed season's three league-award winners as
 * compact gold cards, linking to the Trophy Case. Self-fetching async RSC that
 * renders NOTHING (no header, no shell) when the season has no awards, keeping
 * the hub curated and crash-free pre-seed. The parent supplies the eyebrow via
 * `kicker`; kept visually consistent with sibling hub modules.
 */
export async function ReigningHonors({
  seasonId,
  seasonYear,
  kicker,
}: {
  seasonId: number;
  seasonYear: number;
  kicker: string;
}) {
  const awards = await getSeasonAwards(seasonId);
  if (awards.length === 0) return null;

  return (
    <section className="py-4">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className="text-kicker">{kicker}</p>
        <Link
          href="/records/hall-of-fame"
          className="text-caption font-medium text-accent-gold hover:brightness-110"
        >
          The Trophy Case &rarr;
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {awards.map((award) => (
          <HonorCard key={award.id} award={award} />
        ))}
      </div>
      <p className="mt-2 text-caption text-text-tertiary normal-case tracking-normal">
        {`${seasonYear} league honors, commissioner’s call.`}
      </p>
    </section>
  );
}
