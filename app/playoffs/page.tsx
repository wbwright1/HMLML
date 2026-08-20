import { redirect, notFound } from "next/navigation";
import { getLatestSeason } from "@/lib/queries/matchups";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

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
