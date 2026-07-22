import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./relative-time";

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-09-10T12:00:00Z");

  it("returns '' for an unparseable timestamp", () => {
    expect(formatRelativeTime("nonsense", now)).toBe("");
  });

  it("renders sub-minute ages as 'now'", () => {
    expect(formatRelativeTime("2026-09-10T11:59:30Z", now)).toBe("now");
  });

  it("renders a future timestamp as 'now'", () => {
    expect(formatRelativeTime("2026-09-10T12:05:00Z", now)).toBe("now");
  });

  it("renders minutes", () => {
    expect(formatRelativeTime("2026-09-10T11:20:00Z", now)).toBe("40m");
  });

  it("renders hours", () => {
    expect(formatRelativeTime("2026-09-10T07:00:00Z", now)).toBe("5h");
  });

  it("renders days", () => {
    expect(formatRelativeTime("2026-09-08T12:00:00Z", now)).toBe("2d");
  });

  it("crosses the hour boundary at 60 minutes", () => {
    expect(formatRelativeTime("2026-09-10T10:59:00Z", now)).toBe("1h");
  });

  it("crosses the day boundary at 24 hours", () => {
    expect(formatRelativeTime("2026-09-09T11:59:00Z", now)).toBe("1d");
  });
});
