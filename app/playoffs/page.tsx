import { redirect, notFound } from "next/navigation";
import { getLatestSeason } from "@/lib/queries/matchups";

export const dynamic = "force-dynamic";

// /playoffs (no season) isn't a real page: send visitors to the latest
// season's bracket instead of letting this 404.
export default async function PlayoffsIndexPage() {
  let latestSeason: Awaited<ReturnType<typeof getLatestSeason>> = null;
  try {
    latestSeason = await getLatestSeason();
  } catch {
    // DB may be unavailable in dev
  }

  if (!latestSeason) {
    notFound();
  }

  redirect(`/playoffs/${latestSeason.seasonYear}`);
}
