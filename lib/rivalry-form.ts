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
 * Every message the rivalry forms can show. The /commish actions report a
 * result by redirecting with one of these KEYS in the query string, and the
 * page renders only a known key, so a crafted URL can never put arbitrary
 * text on the console.
 */
export const RIVALRY_MESSAGES = {
  created: "Rivalry saved. The whole site picks it up on the next render.",
  updated: "Rivalry updated.",
  deleted: "Rivalry deleted.",
  "missing-franchise": "Pick both franchises.",
  "self-rival": "A franchise cannot be its own rival.",
  "missing-name": "A rivalry needs a name.",
  "name-too-long": `Name is capped at ${RIVALRY_LIMITS.name} characters.`,
  "tagline-too-long": `Tagline is capped at ${RIVALRY_LIMITS.tagline} characters.`,
  "origin-too-long": `Origin is capped at ${RIVALRY_LIMITS.origin} characters.`,
  "trophy-too-long": `Trophy name is capped at ${RIVALRY_LIMITS.trophyName} characters.`,
  "bad-year": `Origin year must be a four-digit year (${RIVALRY_LIMITS.minYear}-${RIVALRY_LIMITS.maxYear}).`,
  "duplicate-pair": "Those two already have a named rivalry. Edit that one instead.",
  "unknown-franchise": "One of those franchises no longer exists.",
  "not-found": "That rivalry is already gone.",
  invalid: "That rivalry did not validate.",
} as const;

export type RivalryMessageKey = keyof typeof RIVALRY_MESSAGES;

/** Narrows an untrusted query-string value to a known message key. */
export function asRivalryMessageKey(v: unknown): RivalryMessageKey | null {
  return typeof v === "string" && Object.hasOwn(RIVALRY_MESSAGES, v)
    ? (v as RivalryMessageKey)
    : null;
}

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
function optionalText(max: number, key: RivalryMessageKey) {
  return z
    .string()
    .trim()
    .max(max, key)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .default(null);
}

const rivalryFormSchema = z
  .object({
    franchiseOneId: z.string().trim().min(1, "missing-franchise"),
    franchiseTwoId: z.string().trim().min(1, "missing-franchise"),
    name: z
      .string()
      .trim()
      .min(1, "missing-name")
      .max(RIVALRY_LIMITS.name, "name-too-long"),
    tagline: optionalText(RIVALRY_LIMITS.tagline, "tagline-too-long"),
    origin: optionalText(RIVALRY_LIMITS.origin, "origin-too-long"),
    trophyName: optionalText(RIVALRY_LIMITS.trophyName, "trophy-too-long"),
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
          ctx.addIssue({ code: "custom", message: "bad-year" });
          return z.NEVER;
        }
        return n;
      }),
  })
  .refine((v) => v.franchiseOneId !== v.franchiseTwoId, {
    message: "self-rival",
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
  | { ok: false; error: RivalryMessageKey };

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
 * the key of the first validation message (see RIVALRY_MESSAGES).
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
      error: asRivalryMessageKey(parsed.error.issues[0]?.message) ?? "invalid",
    };
  }
  const v = parsed.data;
  const pair = canonicalRivalryPair(v.franchiseOneId, v.franchiseTwoId);
  if (!pair) return { ok: false, error: "self-rival" };
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
