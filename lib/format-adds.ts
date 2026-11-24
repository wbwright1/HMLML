const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Sleeper's trending-adds counts run into the hundreds of thousands; a bare
 * "877698" reads as noise. Formats as "877.7K", "1.2M", or the plain number
 * under 1,000. Paired at render with a TrendingUp icon and an "adds" label.
 */
export function formatAddCount(count: number): string {
  return COMPACT.format(count);
}
