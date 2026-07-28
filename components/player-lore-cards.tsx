import type { ReactNode } from "react";
import Link from "next/link";
import { getAwardIcon } from "@/lib/award-icons";
import { getLeagueLore, type LoreFranchiseBadge, type LorePiece } from "@/lib/queries/lore";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerLink } from "@/components/player-link";
import { FranchiseLogo } from "@/components/franchise-logo";

// Matches any numeral (with an optional decimal point) so a story sentence's
// stat renders in tabular mono, matching every other numeral on the site.
const NUMBER_RE = /-?\d[\d,]*\.?\d*/g;

function renderStory(story: string, numeralClass: string): ReactNode {
  const parts = story.split(NUMBER_RE);
  const numbers = story.match(NUMBER_RE) ?? [];
  const nodes: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part) nodes.push(part);
    if (numbers[i]) {
      nodes.push(
        <span key={i} className={`font-mono tabular-nums ${numeralClass}`}>
          {numbers[i]}
        </span>
      );
    }
  });
  return nodes;
}

// Tone -> card shell. Four thrones stay on plain card-surface (gold mono
// numerals only) so six-plus gold-tinted cards don't read heavy; Cornerstone,
// Draft Steal, and Waiver Miracle get the gold tint reserved, and The Bust
// gets the warm sting tint. See DESIGN TUNING note in the League Lore spec.
const GOLD_TINT_KEYS = new Set(["LEAGUE_CORNERSTONE", "THE_DRAFT_STEAL", "THE_WAIVER_MIRACLE"]);
const THRONE_KEYS = new Set(["SINGLE_GAME_QB", "SINGLE_GAME_RB", "SINGLE_GAME_WR", "SINGLE_GAME_TE"]);

function cardShellClass(piece: LorePiece): string {
  if (piece.tone === "sting") return "card-surface card-tint-warm";
  if (THRONE_KEYS.has(piece.key)) return "card-surface";
  if (piece.tone === "positive" && GOLD_TINT_KEYS.has(piece.key)) return "card-surface card-tint-gold";
  return "card-surface";
}

function kickerClass(piece: LorePiece): string {
  if (piece.tone === "sting") return "text-accent-warm";
  if (piece.tone === "positive" && (GOLD_TINT_KEYS.has(piece.key) || THRONE_KEYS.has(piece.key))) {
    return "text-accent-gold";
  }
  return "text-text-tertiary";
}

// Story-numeral color: thrones get gold mono numerals (their only gold
// treatment, since they sit on a plain card-surface); the sting card gets
// warm; everything else uses the primary ink color.
function numeralClass(piece: LorePiece): string {
  if (piece.tone === "sting") return "text-accent-warm";
  if (THRONE_KEYS.has(piece.key)) return "text-accent-gold";
  return "text-text-primary";
}

const CREST_STRIP_SIZE = 20;
const CREST_STRIP_CAP = 5;

// "Teams they passed through": a compact overlapping-crest stack under the
// story line for The Wanderer and Waiver Yo-Yo, ordered by first appearance.
function FranchiseCrestStrip({ franchises }: { franchises: LoreFranchiseBadge[] }) {
  if (franchises.length === 0) return null;
  const shown = franchises.slice(0, CREST_STRIP_CAP);
  const overflow = franchises.length - shown.length;
  const label = franchises.map((f) => f.name).join(", ");

  return (
    <div className="mt-2 flex items-center" role="img" aria-label={`Teams: ${label}`} title={label}>
      {shown.map((f, i) => (
        <div
          key={f.slug}
          className="ring-1 ring-canvas"
          style={{ marginLeft: i === 0 ? 0 : -6, borderRadius: Math.round(CREST_STRIP_SIZE * 0.28) }}
        >
          <FranchiseLogo
            slug={f.slug}
            name={f.name}
            abbreviation={f.abbreviation ?? undefined}
            brandingColor={f.brandingColor ?? undefined}
            avatarUrl={f.avatarUrl}
            size={CREST_STRIP_SIZE}
            decorative
          />
        </div>
      ))}
      {overflow > 0 ? (
        <span
          className="flex items-center justify-center rounded-full bg-surface text-text-tertiary text-[9px] font-bold ring-1 ring-canvas"
          style={{ width: CREST_STRIP_SIZE, height: CREST_STRIP_SIZE, marginLeft: -6 }}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function LoreCard({ piece }: { piece: LorePiece }) {
  // The card body already links to /teams/[slug] via piece.href for pieces
  // with a franchise crest (see lib/queries/lore.ts); nesting a second anchor
  // around the player name there would nest <a> tags, so the name link is
  // only added when the card itself is NOT already a link.
  const nameBlock = (
    <div className="flex items-center gap-3 mb-1">
      <PlayerHeadshot
        playerId={piece.playerId}
        name={piece.playerName}
        size={56}
        showTeamBadge={false}
        franchiseBadge={piece.franchiseBadge ?? null}
      />
      <p className="text-h3 text-text-primary">{piece.playerName}</p>
    </div>
  );

  const content = (
    <>
      <p className={`text-kicker mb-2 ${kickerClass(piece)}`}>
        <span className="flex items-center gap-1.5">
          {getAwardIcon(piece.iconKey)}
          {piece.title}
        </span>
      </p>
      {piece.href ? (
        nameBlock
      ) : (
        <PlayerLink playerId={piece.playerId} className="contents">
          {nameBlock}
        </PlayerLink>
      )}
      <p className="text-body-sm text-text-tertiary mt-1">
        {renderStory(piece.story, numeralClass(piece))}
      </p>
      {piece.franchiseSequence ? (
        <FranchiseCrestStrip franchises={piece.franchiseSequence} />
      ) : null}
    </>
  );

  const shellClass = `${cardShellClass(piece)} p-5`;

  if (piece.href) {
    return (
      <Link
        href={piece.href}
        className={`${shellClass} block transition-colors duration-150 hover:border-accent-gold/40`}
      >
        {content}
      </Link>
    );
  }

  return <div className={shellClass}>{content}</div>;
}

/**
 * The League Lore module: 12 player-story cards spanning the best single
 * game at every position, the draft-day steals and busts, the waiver-wire
 * miracle, and the players who define league history. Self-fetching async
 * RSC; renders nothing when the underlying query returns no pieces (small
 * league, small-N data).
 */
export async function PlayerLoreCards() {
  const pieces = await getLeagueLore();

  if (pieces.length === 0) return null;

  return (
    <div data-testid="player-wing-cards" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {pieces.map((piece) => (
        <LoreCard key={piece.key} piece={piece} />
      ))}
    </div>
  );
}
