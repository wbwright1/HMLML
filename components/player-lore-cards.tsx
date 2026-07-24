import Link from "next/link";
import { getAwardIcon } from "@/lib/award-icons";
import { SNARKY_LABELS } from "@/lib/content";
import { getMostTradedPlayers, getMostChurnedPlayers } from "@/lib/queries/player-lore";
import { getLeagueCornerstone } from "@/lib/queries/franchise-players";
import { getFranchiseCrestById } from "@/lib/queries/franchises";
import { PlayerHeadshot } from "@/components/player-headshot";

function ordinalCount(n: number): string {
  return `${n}x`;
}

/**
 * League-wide player-history callouts: the most-traded player, the most
 * add-churned player, and the single-uniform "cornerstone" with the most
 * points in continuous tenure. Self-fetching async RSC; renders nothing
 * when every underlying query comes back empty (small league, small-N data).
 */
export async function PlayerLoreCards() {
  const [traded, churned, cornerstone] = await Promise.all([
    getMostTradedPlayers(1),
    getMostChurnedPlayers(1),
    getLeagueCornerstone(),
  ]);

  const wanderer = traded[0] ?? null;
  const yoyo = churned[0] ?? null;
  const crest = cornerstone ? await getFranchiseCrestById(cornerstone.franchiseId) : null;

  if (!wanderer && !yoyo && !cornerstone) return null;

  const wandererLabel = SNARKY_LABELS.THE_WANDERER;
  const yoyoLabel = SNARKY_LABELS.WAIVER_YO_YO;
  const cornerstoneLabel = SNARKY_LABELS.LEAGUE_CORNERSTONE;

  return (
    <div
      data-testid="player-wing-cards"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {wanderer && (
        <div className="card-surface rounded-[14px] border border-border p-5">
          <p className="text-caption uppercase text-text-tertiary mb-2">
            <span className="flex items-center gap-1.5">
              {getAwardIcon(wandererLabel.displayText)}
              {wandererLabel.displayText}
            </span>
          </p>
          <div className="flex items-center gap-3 mb-1">
            <PlayerHeadshot
              playerId={wanderer.playerId}
              name={wanderer.playerName}
              size={56}
              showTeamBadge={false}
            />
            <p className="text-h3 text-text-primary">{wanderer.playerName}</p>
          </div>
          <p className="text-body-sm text-text-tertiary mt-1">
            Traded <span className="font-mono tabular-nums">{ordinalCount(wanderer.count)}</span>
            , most in league history
            {wanderer.position ? ` (${wanderer.position})` : ""}.
          </p>
        </div>
      )}

      {yoyo && (
        <div className="card-surface rounded-[14px] border border-border p-5">
          <p className="text-caption uppercase text-text-tertiary mb-2">
            <span className="flex items-center gap-1.5">
              {getAwardIcon(yoyoLabel.displayText)}
              {yoyoLabel.displayText}
            </span>
          </p>
          <div className="flex items-center gap-3 mb-1">
            <PlayerHeadshot
              playerId={yoyo.playerId}
              name={yoyo.playerName}
              size={56}
              showTeamBadge={false}
            />
            <p className="text-h3 text-text-primary">{yoyo.playerName}</p>
          </div>
          <p className="text-body-sm text-text-tertiary mt-1">
            Added <span className="font-mono tabular-nums">{ordinalCount(yoyo.count)}</span>{" "}
            off waivers and free agency, most in league history
            {yoyo.position ? ` (${yoyo.position})` : ""}.
          </p>
        </div>
      )}

      {cornerstone && (
        <Link
          href={crest ? `/teams/${crest.slug}` : "#"}
          className="block rounded-[14px] border border-accent-gold/25 bg-accent-gold-light p-5 transition-colors duration-150 hover:border-accent-gold/40"
        >
          <p className="text-caption uppercase text-accent-gold mb-2">
            <span className="flex items-center gap-1.5">
              {getAwardIcon(cornerstoneLabel.displayText)}
              {cornerstoneLabel.displayText}
            </span>
          </p>
          <div className="flex items-center gap-3 mb-1">
            <PlayerHeadshot
              playerId={cornerstone.playerId}
              name={cornerstone.playerName}
              size={56}
              franchiseBadge={
                crest
                  ? {
                      slug: crest.slug,
                      name: crest.name,
                      abbreviation: crest.abbreviation,
                      brandingColor: crest.brandingColor,
                    }
                  : null
              }
            />
            <p className="text-h3 text-text-primary">{cornerstone.playerName}</p>
          </div>
          <p className="text-body-sm text-text-tertiary mt-1">
            <span className="font-mono tabular-nums">
              {Math.round(cornerstone.franchisePoints)}
            </span>{" "}
            pts in one uniform{crest ? `, ${crest.name}` : ""}.
          </p>
        </Link>
      )}
    </div>
  );
}
