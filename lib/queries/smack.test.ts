import { describe, it, expect } from "vitest";
import { validateSmackBody, SMACK_MAX_LENGTH } from "./smack";

describe("validateSmackBody", () => {
  it("accepts and trims a normal post", () => {
    const result = validateSmackBody("  bring it on  ");
    expect(result).toEqual({ ok: true, body: "bring it on" });
  });

  it("rejects an empty string", () => {
    const result = validateSmackBody("");
    expect(result.ok).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    const result = validateSmackBody("   \n\t ");
    expect(result.ok).toBe(false);
  });

  it("accepts a post exactly at the cap", () => {
    const result = validateSmackBody("x".repeat(SMACK_MAX_LENGTH));
    expect(result.ok).toBe(true);
  });

  it("rejects a post over the cap", () => {
    const result = validateSmackBody("x".repeat(SMACK_MAX_LENGTH + 1));
    expect(result.ok).toBe(false);
  });

  it("counts length after trimming (trailing space doesn't push over cap)", () => {
    const result = validateSmackBody("x".repeat(SMACK_MAX_LENGTH) + "   ");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.length).toBe(SMACK_MAX_LENGTH);
  });
});
