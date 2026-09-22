import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { cachedQuery } from "@/lib/cache";
import { rethrowUnlessTolerable } from "@/lib/db-guard";
import { franchises, rivalries } from "@/lib/db/schema";
import { getLatestAvatarUrls } from "@/lib/queries/franchise-avatars";
import { rivalryPairKey } from "@/lib/queries/rivalry-week";
import type { RivalryInput } from "@/lib/rivalry-form";

// Commissioner-named rivalries: the lore layer over the auto-detected mutual
// rivals in rivalry-week.ts. Rows are keyed by franchise id and stored in
// canonical order (franchise_a_id < franchise_b_id), so a lookup built with
// rivalryPairKey finds a pair no matter which side is "home".

/** One named rivalry, JSON-safe so it can live in the Data Cache. */
export interface NamedRivalry {
  id: number;
  /** Canonical order: franchiseAId < franchiseBId. */
  franchiseAId: string;
  franchiseBId: string;
  name: string;
  tagline: string | null;
  origin: string | null;
  originYear: number | null;
  trophyName: string | null;
}

const namedRivalryColumns = {
  id: rivalries.id,
  franchiseAId: rivalries.franchiseAId,
  franchiseBId: rivalries.franchiseBId,
  name: rivalries.name,
  tagline: rivalries.tagline,
  origin: rivalries.origin,
  originYear: rivalries.originYear,
  trophyName: rivalries.trophyName,
};

async function getNamedRivalriesUncached(): Promise<NamedRivalry[]> {
  try {
    return await db
      .select(namedRivalryColumns)
      .from(rivalries)
      .orderBy(asc(rivalries.name), asc(rivalries.id));
  } catch (e) {
    rethrowUnlessTolerable(e);
    return [];
  }
}

/**
 * Every named rivalry, ordered by name. Cached under the league-data tag, so
 * revalidateSite() (which every /commish rivalry write calls) clears it.
 */
export const getNamedRivalries = cachedQuery(
  ["named-rivalries"],
  getNamedRivalriesUncached,
);

/**
 * Indexes named rivalries by rivalryPairKey (sorted ids joined "|"). Pure, so
 * callers fetch once and look up per matchup without another query.
 */
export function buildRivalryLookup(
  list: readonly NamedRivalry[],
): Map<string, NamedRivalry> {
  const lookup = new Map<string, NamedRivalry>();
  for (const r of list) {
    lookup.set(rivalryPairKey(r.franchiseAId, r.franchiseBId), r);
  }
  return lookup;
}

/** The named rivalry between two franchises in either order, or null. */
export function findNamedRivalry(
  lookup: ReadonlyMap<string, NamedRivalry>,
  franchiseIdA: string,
  franchiseIdB: string,
): NamedRivalry | null {
  if (franchiseIdA === franchiseIdB) return null;
  return lookup.get(rivalryPairKey(franchiseIdA, franchiseIdB)) ?? null;
}

// ---------------------------------------------------------------------------
// /commish console: uncached reads and the write path
// ---------------------------------------------------------------------------

/** Display fields for one side of a rivalry in the commish console. */
export interface RivalryFranchise {
  id: string;
  slug: string;
  name: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
}

export interface CommishRivalryRow extends NamedRivalry {
  franchiseA: RivalryFranchise;
  franchiseB: RivalryFranchise;
}

/**
 * Every named rivalry with both franchises' display fields, for /commish.
 * Uncached on purpose: the console must show a write the instant it lands.
 */
export async function getRivalriesForCommish(): Promise<CommishRivalryRow[]> {
  const fa = alias(franchises, "fa");
  const fb = alias(franchises, "fb");
  const rows = await db
    .select({
      ...namedRivalryColumns,
      aSlug: fa.slug,
      aName: fa.name,
      aAbbreviation: fa.abbreviation,
      aBrandingColor: fa.brandingColor,
      bSlug: fb.slug,
      bName: fb.name,
      bAbbreviation: fb.abbreviation,
      bBrandingColor: fb.brandingColor,
    })
    .from(rivalries)
    .innerJoin(fa, eq(fa.id, rivalries.franchiseAId))
    .innerJoin(fb, eq(fb.id, rivalries.franchiseBId))
    .orderBy(asc(rivalries.name), asc(rivalries.id));

  // Avatars are decoration: FranchiseLogo falls back to its monogram.
  let avatars = new Map<string, string>();
  try {
    avatars = await getLatestAvatarUrls(
      rows.flatMap((r) => [r.franchiseAId, r.franchiseBId]),
    );
  } catch {
    avatars = new Map();
  }

  return rows.map((r) => ({
    id: r.id,
    franchiseAId: r.franchiseAId,
    franchiseBId: r.franchiseBId,
    name: r.name,
    tagline: r.tagline,
    origin: r.origin,
    originYear: r.originYear,
    trophyName: r.trophyName,
    franchiseA: {
      id: r.franchiseAId,
      slug: r.aSlug,
      name: r.aName,
      abbreviation: r.aAbbreviation,
      brandingColor: r.aBrandingColor,
      avatarUrl: avatars.get(r.franchiseAId) ?? null,
    },
    franchiseB: {
      id: r.franchiseBId,
      slug: r.bSlug,
      name: r.bName,
      abbreviation: r.bAbbreviation,
      brandingColor: r.bBrandingColor,
      avatarUrl: avatars.get(r.franchiseBId) ?? null,
    },
  }));
}

/** Every franchise as a select option (id + name), alphabetical. */
export async function getRivalryFranchiseOptions(): Promise<
  { id: string; name: string }[]
> {
  return db
    .select({ id: franchises.id, name: franchises.name })
    .from(franchises)
    .orderBy(asc(franchises.name));
}

export type RivalryWriteResult =
  | { ok: true; id: number }
  | { ok: false; reason: "duplicate-pair" | "not-found" | "unknown-franchise" };

/** Walks Drizzle's cause chain for a Postgres error code. */
function pgErrorCode(e: unknown): string | null {
  let cur: unknown = e;
  for (let depth = 0; cur != null && depth < 5; depth++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

/** Maps the two expected constraint failures to a reason; rethrows the rest. */
function classifyWriteError(e: unknown): RivalryWriteResult {
  const code = pgErrorCode(e);
  if (code === "23505") return { ok: false, reason: "duplicate-pair" };
  if (code === "23503") return { ok: false, reason: "unknown-franchise" };
  throw e;
}

/** Inserts a new rivalry. The input must already be canonical (parseRivalryForm). */
export async function createRivalry(
  input: RivalryInput,
): Promise<RivalryWriteResult> {
  try {
    const [row] = await db
      .insert(rivalries)
      .values(input)
      .returning({ id: rivalries.id });
    return { ok: true, id: row.id };
  } catch (e) {
    return classifyWriteError(e);
  }
}

/** Replaces every editable field of an existing rivalry, pair included. */
export async function updateRivalry(
  id: number,
  input: RivalryInput,
): Promise<RivalryWriteResult> {
  try {
    const rows = await db
      .update(rivalries)
      .set({ ...input, updatedAt: sql`now()` })
      .where(eq(rivalries.id, id))
      .returning({ id: rivalries.id });
    if (rows.length === 0) return { ok: false, reason: "not-found" };
    return { ok: true, id: rows[0].id };
  } catch (e) {
    return classifyWriteError(e);
  }
}

/** Deletes a rivalry by id. Returns false when no row matched. */
export async function deleteRivalry(id: number): Promise<boolean> {
  const rows = await db
    .delete(rivalries)
    .where(eq(rivalries.id, id))
    .returning({ id: rivalries.id });
  return rows.length > 0;
}

/**
 * Idempotent upsert keyed on the canonical pair, for the seed script. Re-running
 * it overwrites the pair's editable fields with the given input.
 */
export async function upsertRivalryByPair(input: RivalryInput): Promise<number> {
  const [row] = await db
    .insert(rivalries)
    .values(input)
    .onConflictDoUpdate({
      target: [rivalries.franchiseAId, rivalries.franchiseBId],
      set: {
        name: input.name,
        tagline: input.tagline,
        origin: input.origin,
        originYear: input.originYear,
        trophyName: input.trophyName,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: rivalries.id });
  return row.id;
}
