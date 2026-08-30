import { describe, expect, it } from "vitest";
import { redactDatabaseUrl, resolveE2eDatabaseUrl } from "./e2e-preflight";

describe("resolveE2eDatabaseUrl", () => {
  it("fails when POSTGRES_URL is missing", () => {
    const result = resolveE2eDatabaseUrl({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("POSTGRES_URL is not set");
      expect(result.message).toContain("git worktree");
    }
  });

  it("fails when POSTGRES_URL is an empty string", () => {
    const result = resolveE2eDatabaseUrl({ POSTGRES_URL: "" });
    expect(result.ok).toBe(false);
  });

  it("fails when POSTGRES_URL is whitespace-only", () => {
    const result = resolveE2eDatabaseUrl({ POSTGRES_URL: "   " });
    expect(result.ok).toBe(false);
  });

  it("succeeds when POSTGRES_URL is present", () => {
    const result = resolveE2eDatabaseUrl({
      POSTGRES_URL: "postgres://user:pass@example.com/mydb",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBe("postgres://user:pass@example.com/mydb");
    }
  });

  it("fails when POSTGRES_DRIVER=pg and the URL is unparseable", () => {
    const result = resolveE2eDatabaseUrl({
      POSTGRES_URL: "not a url",
      POSTGRES_DRIVER: "pg",
    });
    expect(result.ok).toBe(false);
  });

  it("succeeds when POSTGRES_DRIVER=pg and the URL parses", () => {
    const result = resolveE2eDatabaseUrl({
      POSTGRES_URL: "postgres://user:pass@localhost:5432/mydb",
      POSTGRES_DRIVER: "pg",
    });
    expect(result.ok).toBe(true);
  });
});

describe("redactDatabaseUrl", () => {
  it("never emits the password", () => {
    const url = "postgres://user:supersecret@example.com:5432/mydb";
    const redacted = redactDatabaseUrl(url);
    expect(redacted).not.toContain("supersecret");
    expect(redacted).not.toContain("user:");
    expect(redacted).toContain("example.com");
    expect(redacted).toContain("mydb");
  });

  it("degrades gracefully for an unparseable string", () => {
    expect(redactDatabaseUrl("not a url")).toBe("(unparseable connection string)");
  });
});
