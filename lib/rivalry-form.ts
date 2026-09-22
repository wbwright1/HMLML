import { z } from "zod";

// Validation and canonical ordering for commissioner-named rivalries.
//
// Pure and dependency-free (no db, no next/*) so the /commish server actions,
// the seed script, and unit tests all share one definition of "a valid
// rivalry". The rivalries table stores each pair in canonical order
// (franchise_a_id < franchise_b_id, byte order, enforced by a CHECK); every
// write path funnels through canonicalRivalryPair so the constraint can never
// be tripped by which franchise the commish happened to pick first.

export const RIVALRY_LIMITS = {
  name: 60,
  tagline: 140,
  origin: 600,
  trophyName: 60,
  minYear: 1990,
  maxYear: 2100,
} as const;

/**
 * Orders a franchise pair the way the rivalries table stores it: byte order,
 * which is JavaScript's `<` on strings and the same order rivalryPairKey uses.
 * Returns null for a franchise paired with itself.
 */
export function canonicalRivalryPair(
  idOne: string,
  idTwo: string,
): { franchiseAId: string; franchiseBId: string } | null {
  if (idOne === idTwo) return null;
  return idOne < idTwo
    ? { franchiseAId: idOne, franchiseBId: idTwo }
    : { franchiseAId: idTwo, franchiseBId: idOne };
}

/** Trimmed text; blank becomes null so optional columns store NULL, not "". */
function optionalText(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} is capped at ${max} characters.`)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .default(null);
}

const rivalryFormSchema = z
  .object({
    franchiseOneId: z.string().trim().min(1, "Pick both franchises."),
    franchiseTwoId: z.string().trim().min(1, "Pick both franchises."),
    name: z
      .string()
      .trim()
      .min(1, "A rivalry needs a name.")
      .max(RIVALRY_LIMITS.name, `Name is capped at ${RIVALRY_LIMITS.name} characters.`),
    tagline: optionalText(RIVALRY_LIMITS.tagline, "Tagline"),
    origin: optionalText(RIVALRY_LIMITS.origin, "Origin"),
    trophyName: optionalText(RIVALRY_LIMITS.trophyName, "Trophy name"),
    originYear: z
      .string()
      .trim()
      .nullable()
      .default(null)
      .transform((s, ctx) => {
        if (s == null || s.length === 0) return null;
        const n = Number(s);
        if (
          !/^\d{4}$/.test(s) ||
          n < RIVALRY_LIMITS.minYear ||
          n > RIVALRY_LIMITS.maxYear
        ) {
          ctx.addIssue({
            code: "custom",
            message: `Origin year must be a four-digit year (${RIVALRY_LIMITS.minYear}-${RIVALRY_LIMITS.maxYear}).`,
          });
          return z.NEVER;
        }
        return n;
      }),
  })
  .refine((v) => v.franchiseOneId !== v.franchiseTwoId, {
    message: "A franchise cannot be its own rival.",
    path: ["franchiseTwoId"],
  });

export interface RivalryInput {
  franchiseAId: string;
  franchiseBId: string;
  name: string;
  tagline: string | null;
  origin: string | null;
  originYear: number | null;
  trophyName: string | null;
}

export type RivalryParseResult =
  | { ok: true; value: RivalryInput }
  | { ok: false; error: string };

/** Anything with FormData's `get`, so tests can pass a plain FormData. */
interface FormLike {
  get(name: string): FormDataEntryValue | null;
}

const FIELDS = [
  "franchiseOneId",
  "franchiseTwoId",
  "name",
  "tagline",
  "origin",
  "originYear",
  "trophyName",
] as const;

/**
 * Parses a create/edit rivalry form into a canonical-order RivalryInput, or
 * the first validation message in the site's calm voice.
 */
export function parseRivalryForm(form: FormLike): RivalryParseResult {
  // A missing field reads as blank, so a required one fails with its own
  // message rather than zod's generic "expected string".
  const raw: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = form.get(f);
    raw[f] = typeof v === "string" ? v : "";
  }
  const parsed = rivalryFormSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That rivalry did not validate.",
    };
  }
  const v = parsed.data;
  const pair = canonicalRivalryPair(v.franchiseOneId, v.franchiseTwoId);
  if (!pair) return { ok: false, error: "A franchise cannot be its own rival." };
  return {
    ok: true,
    value: {
      ...pair,
      name: v.name,
      tagline: v.tagline,
      origin: v.origin,
      originYear: v.originYear,
      trophyName: v.trophyName,
    },
  };
}

/** Parses a positive integer row id from a form field, or null. */
export function parseRivalryId(form: FormLike): number | null {
  const v = form.get("rivalryId");
  if (typeof v !== "string" || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
