import type { NextConfig } from "next";

// Security headers (site grade 2026-11-24 scored headers 25/100: only HSTS,
// which Vercel sets). Script/style allow 'unsafe-inline' because Next's
// hydration bootstrap and next/font emit inline tags; tighten to nonces later.
// Dev additionally needs 'unsafe-eval' for React Refresh.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  // Franchise avatars are plain <img> tags from arbitrary CDN hosts.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
