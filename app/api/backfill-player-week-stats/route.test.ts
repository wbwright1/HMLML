import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// Auth-boundary tests for the player-week-stats backfill route. The 401
// (unauthorized) and 400 (bad seasonYear) paths return BEFORE the route ever
// touches the database or runs a backfill, so they need no DB and are safe to
// run in the default suite. The 200 success path is intentionally NOT exercised
// here: it would run a real historical backfill against the live DB (and is
// additionally blocked until table migration 0012 is applied).

const SECRET = "test-cron-secret";

beforeAll(() => {
  process.env.CRON_SECRET = SECRET;
});

function req(url: string, authorization?: string): NextRequest {
  return new NextRequest(url, {
    headers: authorization ? { authorization } : {},
  });
}

const BASE = "http://localhost/api/backfill-player-week-stats";

describe("GET /api/backfill-player-week-stats auth", () => {
  it("rejects a request with no authorization header (401)", async () => {
    const res = await GET(req(`${BASE}?seasonYear=2023`));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a request with the wrong bearer token (401)", async () => {
    const res = await GET(req(`${BASE}?seasonYear=2023`, "Bearer nope"));
    expect(res.status).toBe(401);
  });

  it("rejects a valid-auth request with a missing seasonYear (400)", async () => {
    const res = await GET(req(BASE, `Bearer ${SECRET}`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_SEASON_YEAR");
  });

  it("rejects a valid-auth request with a non-numeric seasonYear (400)", async () => {
    const res = await GET(req(`${BASE}?seasonYear=abc`, `Bearer ${SECRET}`));
    expect(res.status).toBe(400);
  });
});
