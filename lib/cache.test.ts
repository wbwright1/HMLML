import { describe, it, expect } from "vitest";
import { cachedQuery, PAGE_REVALIDATE_SECONDS, LEAGUE_DATA_TAG } from "./cache";

/**
 * Type-level guard tests.
 *
 * The @ts-expect-error lines are the assertion: if JsonSafe ever stops
 * rejecting these shapes, the expected error disappears and `tsc` fails on the
 * unused directive. That makes the compile-time guard itself regression-tested,
 * which matters because the runtime failure it prevents is silent (a Map
 * serializes to {} and quietly loses every entry).
 */
describe("cachedQuery JsonSafe guard", () => {
  it("accepts a JSON-round-trippable shape", () => {
    const ok = cachedQuery(["ok"], async (id: number) => ({
      id,
      name: "x",
      nested: { count: 1, tags: ["a"] },
      nullable: null as string | null,
    }));
    expect(typeof ok).toBe("function");
  });

  it("rejects a Date, which unstable_cache turns into a string", () => {
    // @ts-expect-error Date does not survive JSON round-tripping
    const bad = cachedQuery(["date"], async () => ({ at: new Date() }));
    expect(typeof bad).toBe("function");
  });

  it("rejects a Map, which unstable_cache turns into {}", () => {
    // @ts-expect-error Map does not survive JSON round-tripping
    const bad = cachedQuery(["map"], async () => new Map<string, string>());
    expect(typeof bad).toBe("function");
  });

  it("rejects a Set", () => {
    // @ts-expect-error Set does not survive JSON round-tripping
    const bad = cachedQuery(["set"], async () => new Set<string>());
    expect(typeof bad).toBe("function");
  });

  it("rejects a Date nested inside an array of objects", () => {
    // @ts-expect-error Date nested in an array element still fails
    const bad = cachedQuery(["nested-date"], async () => [
      { id: 1, createdAt: new Date() },
    ]);
    expect(typeof bad).toBe("function");
  });
});

describe("cache constants", () => {
  it("shares one tag so any sync can clear every cached query", () => {
    expect(LEAGUE_DATA_TAG).toBe("league-data");
  });

  it("uses the page revalidate window as the Data Cache backstop", () => {
    expect(PAGE_REVALIDATE_SECONDS).toBe(3600);
  });
});
