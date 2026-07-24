import { getAwardIcon } from "@/lib/award-icons";
import { PlayerHeadshot } from "@/components/player-headshot";
import type { CornerstonePlayer } from "@/lib/queries/franchise-players";

interface FranchiseCornerstoneCardProps {
  cornerstones: CornerstonePlayer[];
  franchiseSlug: string;
  franchiseName: string;
  franchiseAbbreviation?: string | null;
  franchiseBrandingColor?: string | null;
  franchiseAvatarUrl?: string | null;
}

function apYear(year: number): string {
  return `'${String(year).slice(-2)}`;
}

function lastName(fullName: string): string {
  return fullName.trim().split(/\s+/).slice(-1)[0] ?? fullName;
}

/**
 * Achievement-styled card for the franchise page: the player(s) drafted or
 * traded for and never let go, scored by points in this franchise's colors.
 * See lib/queries/franchise-players.ts for eligibility/scoring rules. Mirrors
 * PlayerAwardCard / the league-wide player-lore cards' gold-tint styling.
 */
export function FranchiseCornerstoneCard({
  cornerstones,
  franchiseSlug,
  franchiseName,
  franchiseAbbreviation,
  franchiseBrandingColor,
  franchiseAvatarUrl,
}: FranchiseCornerstoneCardProps) {
  if (cornerstones.length === 0) return null;

  const crest = {
    slug: franchiseSlug,
    name: franchiseName,
    abbreviation: franchiseAbbreviation ?? null,
    brandingColor: franchiseBrandingColor ?? null,
    avatarUrl: franchiseAvatarUrl ?? null,
  };

  if (cornerstones.length === 1) {
    const c = cornerstones[0];
    const verb =
      c.via === "draft"
        ? "Drafted"
        : c.blockbuster === true
          ? "Blockbuster trade,"
          : "Traded for";
    const seasonsPhrase = `${c.tenureSeasons} season${c.tenureSeasons !== 1 ? "s" : ""} and counting`;

    return (
      <div className="card-surface card-tint-gold p-5">
        <p className="text-kicker text-accent-gold mb-3">
          <span className="flex items-center gap-1.5">
            {getAwardIcon("Franchise Cornerstone")}
            Franchise Cornerstone
          </span>
        </p>
        <div className="flex items-center gap-3">
          <PlayerHeadshot playerId={c.playerId} name={c.playerName} size={72} franchiseBadge={crest} />
          <div>
            <p className="text-h3 text-text-primary">{c.playerName}</p>
            <p className="text-body-sm text-text-tertiary mt-1">
              {verb} <span className="font-mono tabular-nums">{apYear(c.acquiredYear)}</span> ·{" "}
              <span className="font-mono tabular-nums">
                {Math.round(c.franchisePoints).toLocaleString()}
              </span>{" "}
              pts ·{" "}
              <span className="font-mono tabular-nums">{c.franchiseStarts}</span> starts ·{" "}
              {seasonsPhrase}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const [a, b] = cornerstones;
  const combinedPts = Math.round(a.franchisePoints + b.franchisePoints);
  const sameOrigin = a.via === b.via && a.acquiredYear === b.acquiredYear;
  const subline = sameOrigin
    ? `Both ${a.via === "draft" ? "drafted" : "traded for"} ${apYear(a.acquiredYear)} · ${combinedPts.toLocaleString()} pts combined.`
    : `Since ${apYear(a.acquiredYear)} and ${apYear(b.acquiredYear)} · ${combinedPts.toLocaleString()} pts combined.`;

  return (
    <div className="card-surface card-tint-gold p-5">
      <p className="text-kicker text-accent-gold mb-3">
        <span className="flex items-center gap-1.5">
          {getAwardIcon("Franchise Cornerstones")}
          Franchise Cornerstones
        </span>
      </p>
      <div className="flex items-center gap-3">
        <div className="flex -space-x-3">
          <PlayerHeadshot playerId={a.playerId} name={a.playerName} size={64} franchiseBadge={crest} />
          <PlayerHeadshot playerId={b.playerId} name={b.playerName} size={64} franchiseBadge={crest} />
        </div>
        <div>
          <p className="text-h3 text-text-primary">
            {lastName(a.playerName)} · {lastName(b.playerName)}
          </p>
          <p className="text-body-sm text-text-tertiary mt-1">{subline}</p>
        </div>
      </div>
    </div>
  );
}
