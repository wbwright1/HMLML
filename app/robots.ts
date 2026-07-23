import type { MetadataRoute } from "next";

// HMLML is a private league site; it should never be indexed by search
// engines or crawled by bots.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
