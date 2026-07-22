import { redirect } from "next/navigation";
import { FranchiseLogo } from "@/components/franchise-logo";
import { ClaimCodeManager } from "@/components/commish/claim-code-manager";
import { getSessionMember, isClaimCodeExpired } from "@/lib/auth";
import { getAllMembersWithFranchise } from "@/lib/queries/members";
import { getAllSmackPostsForModeration } from "@/lib/queries/moderation";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import { setPostHiddenAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Commish Console | Harambe Memorial League Memorial League",
  description: "Issue claim codes and moderate the smack feed.",
};

export default async function CommishPage() {
  const member = await getSessionMember();
  if (!member || member.role !== "commish") {
    redirect("/claim");
  }

  const [members, posts] = await Promise.all([
    getAllMembersWithFranchise(),
    getAllSmackPostsForModeration(30),
  ]);

  return (
    <div className="space-y-12 py-8">
      <header className="space-y-2">
        <p className="text-kicker">Commish console</p>
        <h1 className="text-h1 font-serif italic text-text-primary">
          The keys to the kingdom.
        </h1>
        <p className="text-body-sm text-text-secondary">
          Hand out claim codes and keep the smack feed honest.
        </p>
      </header>

      <MembersSection members={members} />
      <ModerationSection posts={posts} />
    </div>
  );
}

type MemberRow = Awaited<
  ReturnType<typeof getAllMembersWithFranchise>
>[number];

function codeStatusLabel(row: MemberRow): string {
  if (!row.claimCodeHash) return "No code yet";
  if (row.codeGeneratedAt) {
    // An expired code can't be redeemed, so flag it for rotation rather than
    // showing a stale issued-time the commish would have to reason about.
    if (isClaimCodeExpired(row.codeGeneratedAt)) return "Code expired";
    const rel = formatRelativeTime(row.codeGeneratedAt.toISOString());
    return rel === "now" ? "Code issued just now" : `Code issued ${rel} ago`;
  }
  return "Code issued";
}

function MembersSection({ members }: { members: MemberRow[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="text-h3 text-text-primary">Members</h2>
        <span className="text-caption text-text-tertiary tabular-nums">
          {members.length} total
        </span>
      </div>

      <div className="space-y-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="card-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              {m.franchiseSlug && m.franchiseName ? (
                <FranchiseLogo
                  slug={m.franchiseSlug}
                  name={m.franchiseName}
                  abbreviation={m.franchiseAbbreviation ?? undefined}
                  brandingColor={m.franchiseBrandingColor ?? undefined}
                  avatarUrl={m.franchiseAvatarUrl}
                  size="sm"
                  decorative
                />
              ) : (
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-surface-muted text-caption text-text-tertiary"
                  aria-hidden="true"
                >
                  -
                </div>
              )}
              <div className="min-w-0">
                <p className="text-body-sm font-semibold text-text-primary truncate">
                  {m.displayName}
                  {m.role === "commish" && (
                    <span className="ml-2 rounded-full bg-accent-gold-light px-2 py-0.5 text-caption font-semibold text-accent-gold align-middle">
                      COMMISH
                    </span>
                  )}
                </p>
                <p className="text-caption text-text-tertiary truncate">
                  {m.franchiseName ?? "Unattached"} · {codeStatusLabel(m)}
                </p>
              </div>
            </div>

            <ClaimCodeManager memberId={m.id} hasCode={!!m.claimCodeHash} />
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-body-sm text-text-tertiary">
            No members yet. The daily sync seeds them from the current roster.
          </p>
        )}
      </div>
    </section>
  );
}

type PostRow = Awaited<
  ReturnType<typeof getAllSmackPostsForModeration>
>[number];

function ModerationSection({ posts }: { posts: PostRow[] }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="text-h3 text-text-primary">Smack moderation</h2>
        <span className="text-caption text-text-tertiary tabular-nums">
          {posts.length} recent
        </span>
      </div>

      <div className="space-y-2">
        {posts.map((p) => (
          <div
            key={p.id}
            className={cn(
              "card-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
              p.hidden && "opacity-60",
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <FranchiseLogo
                slug={p.franchiseSlug}
                name={p.franchiseName}
                abbreviation={p.franchiseAbbreviation ?? undefined}
                brandingColor={p.franchiseBrandingColor ?? undefined}
                avatarUrl={p.franchiseAvatarUrl}
                size="sm"
                decorative
              />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="text-body-sm font-semibold text-text-primary truncate">
                    {p.franchiseName}
                  </p>
                  <span className="text-caption text-text-tertiary shrink-0 tabular-nums">
                    {formatRelativeTime(p.createdAt.toISOString())}
                  </span>
                  {p.hidden && (
                    <span className="rounded-full bg-accent-warm-light px-2 py-0.5 text-caption font-semibold text-accent-warm shrink-0">
                      HIDDEN
                    </span>
                  )}
                </div>
                <p className="mt-1 text-body-sm text-text-secondary">{p.body}</p>
                <p className="mt-1 text-caption text-text-muted truncate">
                  {p.memberDisplayName}
                </p>
              </div>
            </div>

            <form action={setPostHiddenAction} className="shrink-0">
              <input type="hidden" name="postId" value={p.id} />
              <input
                type="hidden"
                name="hidden"
                value={p.hidden ? "false" : "true"}
              />
              <button
                type="submit"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {p.hidden ? "Unhide" : "Hide"}
              </button>
            </form>
          </div>
        ))}
        {posts.length === 0 && (
          <p className="text-body-sm text-text-tertiary">
            No smack posts yet. Quiet league.
          </p>
        )}
      </div>
    </section>
  );
}
