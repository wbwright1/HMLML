import { FranchiseLogo } from "@/components/franchise-logo";
import { formatRelativeTime } from "@/lib/relative-time";
import type { SmackPost } from "@/lib/content";

interface SmackFeedProps {
  posts: readonly SmackPost[];
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
 * relative timestamp + quote. Renders nothing when there are no posts.
 */
export function SmackFeed({ posts, className = "space-y-3" }: SmackFeedProps) {
  if (posts.length === 0) return null;

  return (
    <div className={className}>
      {posts.map((post, i) => (
        <div key={`${post.franchiseSlug}-${i}`} className="card-surface p-4">
          <div className="flex items-start gap-3">
            <FranchiseLogo
              slug={post.franchiseSlug}
              name={post.franchiseName}
              abbreviation={post.abbreviation}
              brandingColor={post.brandingColor}
              size="sm"
              decorative
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-body-sm font-semibold text-text-primary truncate">
                  {post.franchiseName}
                </p>
                <span className="text-caption text-text-tertiary shrink-0 tabular-nums">
                  {formatRelativeTime(post.postedAt)}
                </span>
              </div>
              <p className="mt-1.5 text-body-sm text-text-secondary">
                {post.body}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
