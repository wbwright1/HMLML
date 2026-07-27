import { z } from "zod";
import { FantasyCalcValueSchema, type FantasyCalcValue } from "./fantasycalc-schemas";

// ─── Constants ───────────────────────────────────────────────────────────────

const FANTASYCALC_BASE_URL = "https://api.fantasycalc.com";

// ─── Result Type ─────────────────────────────────────────────────────────────

export type FantasyCalcResult<T> =
  | { data: T }
  | { error: { message: string; code: string } };

// ─── Generic Fetch Helper ────────────────────────────────────────────────────

async function fetchFantasyCalc<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: { revalidate?: number }
): Promise<FantasyCalcResult<T>> {
  try {
    const url = path.startsWith("http")
      ? path
      : `${FANTASYCALC_BASE_URL}${path}`;
    const res = await fetch(url, {
      next: { revalidate: options?.revalidate ?? 0 },
    });

    if (!res.ok) {
      const message = `FantasyCalc API returned ${res.status}`;
      console.error(`[fantasycalc] ${message} for ${path}`);
      return { error: { message, code: "FANTASYCALC_HTTP_ERROR" } };
    }

    const json = await res.json();
    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      const message = parsed.error.message;
      console.error(`[fantasycalc] Validation error for ${path}: ${message}`);
      return { error: { message, code: "FANTASYCALC_VALIDATION_ERROR" } };
    }

    return { data: parsed.data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[fantasycalc] Network error for ${path}: ${message}`);
    return { error: { message, code: "FANTASYCALC_NETWORK_ERROR" } };
  }
}

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Fetch current dynasty trade values for all players and picks, scored for a
 * 2-QB / 12-team / PPR league (matching this league's format).
 */
export async function getCurrentValues(): Promise<
  FantasyCalcResult<FantasyCalcValue[]>
> {
  return fetchFantasyCalc(
    "/values/current?isDynasty=true&numQbs=2&numTeams=12&ppr=1",
    z.array(FantasyCalcValueSchema)
  );
}
