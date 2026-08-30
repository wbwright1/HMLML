import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright's forced-state e2e dev servers (hub-preseason, hub-in-season;
  // see playwright.config.ts) run concurrently against this same source tree
  // on different ports. Next's dev lock file lives inside .next and is keyed
  // per directory, not per port, so two concurrent `next dev` processes
  // sharing the default .next would collide with "Another next dev server is
  // already running" even though they are on different ports. NEXT_DIST_DIR
  // gives each forced-state server its own build directory.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "sleepercdn.com",
        pathname: "/content/nfl/players/**",
      },
      {
        protocol: "https",
        hostname: "sleepercdn.com",
        pathname: "/images/team_logos/nfl/**",
      },
    ],
  },
};

export default nextConfig;
