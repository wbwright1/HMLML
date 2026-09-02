/**
 * Renders a caught database error as a human-readable string that keeps the
 * fields Postgres puts the useful information in.
 *
 * A bare `e.message` on a constraint violation reads "insert or update on table
 * X violates foreign key constraint Y" and stops there, while Postgres's DETAIL
 * ("Key (player_id)=(1234) is not present in table players") names the exact row
 * that broke. Dropping that field is what turned issue #269 into a database
 * session. The neon-http driver surfaces `detail` / `constraint` on the error
 * object or on its `cause`, so both are read defensively.
 */
export function describeDbError(e: unknown): string {
  const base = e instanceof Error ? e.message : "Unknown error";
  const src = e as { detail?: string; constraint?: string; cause?: unknown } | null;
  const cause = src?.cause as
    | { detail?: string; constraint?: string }
    | undefined;
  const detail = src?.detail ?? cause?.detail;
  const constraint = src?.constraint ?? cause?.constraint;
  return [base, constraint && `constraint ${constraint}`, detail]
    .filter(Boolean)
    .join("; ");
}
