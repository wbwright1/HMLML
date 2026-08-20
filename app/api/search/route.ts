import { NextResponse } from "next/server";
import { z } from "zod";
import { getAllFranchises } from "@/lib/queries/franchises";
import { searchPlayers } from "@/lib/queries/players";

/** Site-wide search: teams (in-memory over 12 rows) + players (indexed name match). */

const MAX_RESULTS = 8;

const querySchema = z
  .string()
  .trim()
  .min(2, "Search needs at least 2 characters.")
  .max(60, "Search is too long.");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get("q") ?? "";

  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          message: parsed.error.issues[0]?.message ?? "Invalid search query.",
          code: "INVALID_QUERY",
        },
      },
      { status: 400 }
    );
  }

  const query = parsed.data;
  const needle = query.toLowerCase();

  // Search on the normalized term so "Mahomes" and "mahomes" share one cache
  // entry (searchPlayers is cached per-argument). The Zod schema above bounds
  // the key space by construction: trimmed, 2-60 chars.
  const [allFranchises, playerRows] = await Promise.all([
    getAllFranchises(),
    searchPlayers(needle),
  ]);

  const franchises = (allFranchises ?? [])
    .filter((f) => {
      const name = f.name?.toLowerCase() ?? "";
      const abbr = f.abbreviation?.toLowerCase() ?? "";
      return name.includes(needle) || abbr.includes(needle);
    })
    .slice(0, MAX_RESULTS)
    .map((f) => ({
      name: f.name,
      slug: f.slug,
      abbreviation: f.abbreviation ?? null,
      avatarUrl: f.avatarUrl ?? null,
    }));

  const players = playerRows.slice(0, MAX_RESULTS).map((p) => ({
    id: p.id,
    name:
      p.fullName ??
      [p.firstName, p.lastName].filter(Boolean).join(" ") ??
      "Unknown Player",
    position: p.position ?? null,
    nflTeam: p.nflTeam ?? null,
  }));

  return NextResponse.json({
    data: { franchises, players },
    syncedAt: new Date().toISOString(),
  });
}
