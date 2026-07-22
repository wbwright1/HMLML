import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";

/** Shapes returned by /api/search (see app/api/search/route.ts). */
export interface SearchTeam {
  name: string;
  slug: string;
  abbreviation: string | null;
  avatarUrl: string | null;
}

export interface SearchPlayer {
  id: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
}

export interface SearchData {
  franchises: SearchTeam[];
  players: SearchPlayer[];
}

/** A single flattened, keyboard-navigable option. */
export interface SearchOption {
  id: string;
  href: string;
}

export function teamOptionId(slug: string): string {
  return `search-opt-team-${slug}`;
}

export function playerOptionId(id: string): string {
  return `search-opt-player-${id}`;
}

export function teamHref(slug: string): string {
  return `/teams/${slug}`;
}

export function playerHref(name: string): string {
  return `/players?q=${encodeURIComponent(name)}`;
}

/**
 * Builds the flat, ordered option list (teams first, then players) so the
 * combobox owner can map ArrowUp/Down + Enter to a concrete href. Must stay
 * in lockstep with the render order below.
 */
export function flattenOptions(data: SearchData): SearchOption[] {
  return [
    ...data.franchises.map((f) => ({
      id: teamOptionId(f.slug),
      href: teamHref(f.slug),
    })),
    ...data.players.map((p) => ({
      id: playerOptionId(p.id),
      href: playerHref(p.name),
    })),
  ];
}

interface SearchResultsProps {
  data: SearchData;
  /** id of the currently active option (aria-activedescendant target). */
  activeId: string | null;
  /** Fires when an option is chosen via pointer; closes the surface. */
  onSelect: () => void;
  /** Hover moves the active descendant to keep keyboard + pointer in sync. */
  onHover: (id: string) => void;
}

function OptionRow({
  id,
  href,
  active,
  onSelect,
  onHover,
  children,
}: {
  id: string;
  href: string;
  active: boolean;
  onSelect: () => void;
  onHover: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      id={id}
      role="option"
      aria-selected={active}
      onClick={onSelect}
      onMouseEnter={() => onHover(id)}
      className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-body-sm outline-none ${
        active
          ? "bg-accent-gold-light text-text-primary"
          : "text-text-secondary hover:bg-surface"
      }`}
    >
      {/* Visible (non-color) active marker: a gold leading bar */}
      <span
        aria-hidden="true"
        className={`h-6 w-0.5 shrink-0 rounded-full ${
          active ? "bg-accent-gold" : "bg-transparent"
        }`}
      />
      {children}
    </Link>
  );
}

export function SearchResults({
  data,
  activeId,
  onSelect,
  onHover,
}: SearchResultsProps) {
  const hasResults = data.franchises.length > 0 || data.players.length > 0;

  if (!hasResults) {
    return (
      <div className="px-4 py-6 text-center text-body-sm text-text-tertiary">
        No matches. Maybe they were traded away.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-2">
      {data.franchises.length > 0 && (
        <div role="group" aria-label="Teams">
          <div className="text-kicker px-3 pb-1 pt-1">Teams</div>
          {data.franchises.map((f) => {
            const id = teamOptionId(f.slug);
            return (
              <OptionRow
                key={id}
                id={id}
                href={teamHref(f.slug)}
                active={activeId === id}
                onSelect={onSelect}
                onHover={onHover}
              >
                <FranchiseLogo
                  slug={f.slug}
                  name={f.name}
                  abbreviation={f.abbreviation ?? undefined}
                  avatarUrl={f.avatarUrl}
                  size="sm"
                  decorative
                />
                <span className="truncate font-medium text-text-primary">
                  {f.name}
                </span>
              </OptionRow>
            );
          })}
        </div>
      )}

      {data.players.length > 0 && (
        <div role="group" aria-label="Players">
          <div className="text-kicker px-3 pb-1 pt-1">Players</div>
          {data.players.map((p) => {
            const id = playerOptionId(p.id);
            const meta = [p.position, p.nflTeam].filter(Boolean).join(" · ");
            return (
              <OptionRow
                key={id}
                id={id}
                href={playerHref(p.name)}
                active={activeId === id}
                onSelect={onSelect}
                onHover={onHover}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-text-primary">
                    {p.name}
                  </span>
                  {meta && (
                    <span className="truncate text-caption text-text-tertiary">
                      {meta}
                    </span>
                  )}
                </span>
              </OptionRow>
            );
          })}
        </div>
      )}
    </div>
  );
}
