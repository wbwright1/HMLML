import {
  buildRivalryLookup,
  getNamedRivalries,
  type NamedRivalry,
} from "@/lib/queries/rivalries";

// Named rivalries are genuinely optional page data: they decorate a matchup,
// a schedule row or a team page, and a page without them is still true. So a
// read failure here renders no rivalry names rather than an error boundary;
// each page's PRIMARY fetch keeps rethrowUnlessTolerable.

/** Every named rivalry, or [] if the read fails. */
export async function getNamedRivalriesOrEmpty(): Promise<NamedRivalry[]> {
  try {
    return await getNamedRivalries();
  } catch {
    return [];
  }
}

/** A pair-key lookup of every named rivalry, or an empty one if the read fails. */
export async function getNamedRivalryLookup(): Promise<
  Map<string, NamedRivalry>
> {
  return buildRivalryLookup(await getNamedRivalriesOrEmpty());
}
