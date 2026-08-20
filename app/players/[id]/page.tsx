import { notFound } from "next/navigation";
import { PlayerProfile } from "@/components/player-profile/player-profile";
import { getPlayerById } from "@/lib/queries/players";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

interface PlayerProfilePageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ season?: string }>;
}

export async function generateMetadata({ params }: PlayerProfilePageProps) {
  const { id } = await params;

  let player: Awaited<ReturnType<typeof getPlayerById>> = null;
  try {
    player = await getPlayerById(id);
  } catch {
    // DB may not be connected in dev
  }

  if (!player) {
    return { title: "Player Not Found | Harambe Memorial League Memorial League" };
  }

  const name = player.fullName ?? "Unknown Player";
  const parts = [player.position, player.nflTeam].filter(Boolean);
  return {
    title: `${name} — ${parts.join(" · ")} | HMLML`,
    description: `${name}'s dynasty value history, weekly lines, and career timeline in the Harambe Memorial League Memorial League.`,
  };
}

export default async function PlayerProfilePage({
  params,
  searchParams,
}: PlayerProfilePageProps) {
  const { id } = await params;
  const { season } = await searchParams;

  const rendered = await PlayerProfile({ playerId: id, season, variant: "page" });
  if (rendered === null) notFound();

  return rendered;
}
