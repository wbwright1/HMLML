import { ProfileModalShell } from "@/components/player-profile/profile-modal-shell";
import { PlayerProfile } from "@/components/player-profile/player-profile";

interface InterceptedPlayerModalProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}

/**
 * The intercepted route: a same-app soft navigation to /players/[id] renders
 * this modal instead of the canonical page (app/players/[id]/page.tsx still
 * handles hard loads via app/@modal/default.tsx returning null). Never calls
 * notFound() — an unknown player renders the site's snarky 404 copy INSIDE
 * the shell so the close button and backdrop dismiss still work.
 */
export default async function InterceptedPlayerModal({
  params,
  searchParams,
}: InterceptedPlayerModalProps) {
  const { id } = await params;
  const { season } = await searchParams;

  return (
    <ProfileModalShell>
      <PlayerProfileOrNotFound playerId={id} season={season} />
    </ProfileModalShell>
  );
}

async function PlayerProfileOrNotFound({
  playerId,
  season,
}: {
  playerId: string;
  season?: string;
}) {
  // Calling the async server component directly (not as JSX) gets its return
  // value in hand — PlayerProfile returns null for an unknown player — without
  // querying getPlayerProfile a second time just to check existence.
  const rendered = await PlayerProfile({ playerId, season, variant: "modal" });

  if (rendered === null) {
    return (
      <div className="space-y-3 py-4">
        <p className="text-kicker text-text-tertiary">Player 404</p>
        <h1
          id="player-profile-title"
          className="text-h2 font-serif italic text-text-primary"
        >
          Not on any roster we know of.
        </h1>
        <p className="text-body text-text-secondary max-w-md">
          This player doesn&apos;t exist in our records. Maybe they were
          waived, retired, or traded to a league that actually cares.
        </p>
        <a
          href="/players"
          className="inline-block text-body-sm font-medium text-accent-gold hover:underline"
        >
          Browse all players
        </a>
      </div>
    );
  }

  return rendered;
}
