import { redirect } from "next/navigation";

// ISR: rendered once, then served from cache until a successful sync calls
// revalidatePath("/", "layout"). Time window is only a backstop (lib/cache.ts).
export const revalidate = 3600;

// The GOAT Ladder moved into the Hall of Fame & Shame as a titled module.
// Old links and bookmarks still point here, so redirect rather than 404.
export default function GoatLadderRedirect() {
  redirect("/records/hall-of-fame");
}
