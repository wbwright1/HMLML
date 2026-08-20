import { FranchiseLogo } from "@/components/franchise-logo";
import { formatRelativeTime } from "@/lib/relative-time";
import type { SmackPost } from "@/lib/content";
import type { RecentSmackPost } from "@/lib/queries/smack";

/**
 * A single smack card, normalized so the feed renders real member posts and the
 * Site Desk seed posts identically. `authorName` is the member display name for
 * real posts (shown secondary in the meta line) and null for Site Desk seeds
 * (which keep their franchise-only attribution).
 */
export interface SmackFeedItem {
  key: string;
  franchiseName: string;
  franchiseSlug: string;
  abbreviation: string | null;
  brandingColor: string | null;
  avatarUrl: string | null;
  body: string;
  /** ISO 8601. */
  postedAt: string;
  authorName: string | null;
}

/** Maps real DB smack posts (crest + member author) into feed items. */
export function smackItemsFromPosts(
  posts: readonly RecentSmackPost[],
): SmackFeedItem[] {
  return posts.map((p) => ({
    key: `post-${p.id}`,
    franchiseName: p.franchiseName,
    franchiseSlug: p.franchiseSlug,
    abbreviation: p.franchiseAbbreviation,
    brandingColor: p.franchiseBrandingColor,
    avatarUrl: p.avatarUrl,
    body: p.body,
    postedAt:
      p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    authorName: p.memberDisplayName,
  }));
}

/** Maps Site Desk seed posts into feed items (no member author). */
export function smackItemsFromSeeds(
  seeds: readonly SmackPost[],
): SmackFeedItem[] {
  return seeds.map((s, i) => ({
    key: `seed-${s.franchiseSlug}-${i}`,
    franchiseName: s.franchiseName,
    franchiseSlug: s.franchiseSlug,
    abbreviation: s.abbreviation,
    brandingColor: s.brandingColor,
    avatarUrl: null,
    body: s.body,
    postedAt: s.postedAt,
    authorName: null,
  }));
}

interface SmackFeedProps {
  items: readonly SmackFeedItem[];
  /**
   * Classes for the card container. Defaults to a vertical stack (1a right
   * rail); pass a grid (e.g. "grid grid-cols-1 sm:grid-cols-2 gap-3") for the
   * 1d two-up layout.
   */
  className?: string;
}

/**
 * Member-posted trash-talk feed, separate from the auto-generated site voice.
 * Server component, zero client JS. Each card: dynasty crest + team name +
 * (author +) relative timestamp + quote. Renders nothing when there are no
 * items.
 */
export function SmackFeed({ items, className = "space-y-3" }: SmackFeedProps) {
  if (items.length === 0) return null;

  return (
    <div className={className}>
      {items.map((item) => {
        const time = formatRelativeTime(item.postedAt);
        const meta = item.authorName ? `${item.authorName} · ${time}` : time;
        return (
          <div key={item.key} className="card-surface p-4">
            <div className="flex items-start gap-3">
              <FranchiseLogo
                slug={item.franchiseSlug}
                name={item.franchiseName}
                abbreviation={item.abbreviation ?? undefined}
                brandingColor={item.brandingColor ?? undefined}
                avatarUrl={item.avatarUrl}
                size="sm"
                decorative
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-body-sm font-semibold text-text-primary truncate">
                    {item.franchiseName}
                  </p>
                  <span className="text-caption text-text-tertiary shrink-0 tabular-nums">
                    {meta}
                  </span>
                </div>
                <p className="mt-1.5 text-body-sm text-text-secondary whitespace-pre-line">
                  {item.body}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
