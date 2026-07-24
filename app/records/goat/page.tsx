import { redirect } from "next/navigation";

// The GOAT Ladder moved into the Hall of Fame & Shame as a titled module.
// Old links and bookmarks still point here, so redirect rather than 404.
export default function GoatLadderRedirect() {
  redirect("/records/hall-of-fame");
}
