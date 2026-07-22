import { describe, it, expect } from "vitest";
import { smackItemsFromPosts, smackItemsFromSeeds } from "./smack-feed";
import type { RecentSmackPost } from "@/lib/queries/smack";
import type { SmackPost } from "@/lib/content";

describe("smackItemsFromSeeds", () => {
  it("maps a Site Desk seed with no member author", () => {
    const seed: SmackPost = {
      franchiseName: "Site Desk",
      franchiseSlug: "site-desk",
      abbreviation: "HQ",
      brandingColor: "#E2B858",
      body: "Twelve teams, one trophy.",
      postedAt: "2026-07-01T00:00:00.000Z",
    };
    const [item] = smackItemsFromSeeds([seed]);
    expect(item.authorName).toBeNull();
    expect(item.avatarUrl).toBeNull();
    expect(item.franchiseName).toBe("Site Desk");
    expect(item.body).toBe("Twelve teams, one trophy.");
    expect(item.postedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(item.key.startsWith("seed-")).toBe(true);
  });
});

describe("smackItemsFromPosts", () => {
  const base: RecentSmackPost = {
    id: 7,
    body: "Talk is cheap.",
    createdAt: new Date("2026-07-20T12:00:00.000Z"),
    memberId: 3,
    memberDisplayName: "GorillaGripper69",
    franchiseId: "f-1",
    franchiseSlug: "gorilla-house",
    franchiseName: "Gorilla House",
    franchiseAbbreviation: "GOR",
    franchiseBrandingColor: "#8FBF7F",
    avatarUrl: "https://cdn.example/av.png",
  };

  it("keeps the member as author and threads the avatar through", () => {
    const [item] = smackItemsFromPosts([base]);
    expect(item.authorName).toBe("GorillaGripper69");
    expect(item.franchiseName).toBe("Gorilla House");
    expect(item.abbreviation).toBe("GOR");
    expect(item.brandingColor).toBe("#8FBF7F");
    expect(item.avatarUrl).toBe("https://cdn.example/av.png");
    expect(item.key).toBe("post-7");
  });

  it("serializes a Date createdAt to an ISO string", () => {
    const [item] = smackItemsFromPosts([base]);
    expect(item.postedAt).toBe("2026-07-20T12:00:00.000Z");
  });

  it("tolerates a null avatar (monogram crest fallback)", () => {
    const [item] = smackItemsFromPosts([{ ...base, avatarUrl: null }]);
    expect(item.avatarUrl).toBeNull();
  });
});
