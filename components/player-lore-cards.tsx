import type { ReactNode } from "react";
import Link from "next/link";
import { getAwardIcon } from "@/lib/award-icons";
import { getLeagueLore, type LorePiece } from "@/lib/queries/lore";
import { PlayerHeadshot } from "@/components/player-headshot";

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

function LoreCard({ piece }: { piece: LorePiece }) {
  const content = (
    <>
      <p className={`text-kicker mb-2 ${kickerClass(piece)}`}>
        <span className="flex items-center gap-1.5">
          {getAwardIcon(piece.iconKey)}
          {piece.title}
        </span>
      </p>
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
      <p className="text-body-sm text-text-tertiary mt-1">
        {renderStory(piece.story, numeralClass(piece))}
      </p>
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
