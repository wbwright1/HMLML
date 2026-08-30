/**
 * Pure preflight checks for running Playwright against the real Postgres
 * database (lives in lib/, not e2e/, because vitest.config.ts excludes e2e/
 * and this needs to be a real unit test per the repo's testing policy).
 *
 * The problem this guards against (#251): a fresh `git worktree` does not
 * carry `.env.local` (it is gitignored and worktrees do not inherit
 * untracked files from the main checkout), so POSTGRES_URL is unset, every
 * DB call throws, and depending on how a given spec handles that error some
 * specs can "pass" vacuously against a completely broken environment. This
 * module gives e2e/global-setup.ts a way to fail the whole run fast and
 * loudly instead.
 */

export type PreflightResult = { ok: true; url: string } | { ok: false; message: string };

const MISSING_ENV_MESSAGE = [
  "POSTGRES_URL is not set.",
  "e2e tests run against a real Postgres database, and `.env.local` is gitignored: it does not travel into a new `git worktree`.",
  "Fix: copy it in from your main checkout, e.g. `cp /path/to/main/checkout/.env.local .`, then re-run.",
].join(" ");

/**
 * Checks that POSTGRES_URL is present (and, when POSTGRES_DRIVER=pg, that it
 * parses as a URL). Does not open a connection; e2e/global-setup.ts does that
 * separately with two read-only SELECTs.
 */
export function resolveE2eDatabaseUrl(env: Partial<NodeJS.ProcessEnv>): PreflightResult {
  const url = env.POSTGRES_URL;

  if (url == null || url.trim() === "") {
    return { ok: false, message: MISSING_ENV_MESSAGE };
  }

  if (env.POSTGRES_DRIVER === "pg") {
    try {
      void new URL(url);
    } catch {
      return {
        ok: false,
        message: `POSTGRES_URL is set but is not a parseable URL (POSTGRES_DRIVER=pg requires one): ${redactDatabaseUrl(url)}`,
      };
    }
  }

  return { ok: true, url };
}

/**
 * Reduces a Postgres connection string to host + database name only, so a
 * redacted target can be logged without ever emitting the password.
 */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const db = parsed.pathname.replace(/^\//, "");
    return `${parsed.hostname}/${db}`;
  } catch {
    return "(unparseable connection string)";
  }
}
