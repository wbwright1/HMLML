import { redirect } from "next/navigation";
import { FranchiseLogo } from "@/components/franchise-logo";
import { ClaimCodeManager } from "@/components/commish/claim-code-manager";
import { getSessionMember } from "@/lib/auth";
import { getAllMembersWithFranchise } from "@/lib/queries/members";
import { getAllSmackPostsForModeration } from "@/lib/queries/moderation";
import {
  getRivalriesForCommish,
  getRivalryFranchiseOptions,
  type CommishRivalryRow,
} from "@/lib/queries/rivalries";
import {
  RIVALRY_LIMITS,
  RIVALRY_MESSAGES,
  asRivalryMessageKey,
} from "@/lib/rivalry-form";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  createRivalryAction,
  deleteRivalryAction,
  setPostHiddenAction,
  updateRivalryAction,
} from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Commish Console | Harambe Memorial League Memorial League",
  description: "Issue claim codes, name rivalries, and moderate the smack feed.",
};

export default async function CommishPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const member = await getSessionMember();
  if (!member || member.role !== "commish") {
    redirect("/claim");
  }

  const params = await searchParams;
  const notice = asRivalryMessageKey(params.rivalry);
  const error = asRivalryMessageKey(params.rivalryError);

  const [members, posts, rivalries, franchiseOptions] = await Promise.all([
    getAllMembersWithFranchise(),
    getAllSmackPostsForModeration(30),
    getRivalriesForCommish(),
    getRivalryFranchiseOptions(),
  ]);

  return (
    <div className="space-y-12 py-8">
      <header className="space-y-2">
        <p className="text-kicker">Commish console</p>
        <h1 className="text-h1 font-serif italic text-text-primary">
          The keys to the kingdom.
        </h1>
        <p className="text-body-sm text-text-secondary">
          Hand out claim codes, name the grudges, and keep the smack feed
          honest.
        </p>
      </header>

      <MembersSection members={members} />
      <RivalriesSection
        rivalries={rivalries}
        franchiseOptions={franchiseOptions}
        notice={notice}
        error={error}
      />
      <ModerationSection posts={posts} />
    </div>
  );
}

type MemberRow = Awaited<
  ReturnType<typeof getAllMembersWithFranchise>
>[number];

function codeStatusLabel(row: MemberRow): string {
  if (!row.claimCode && !row.claimCodeHash) return "No code yet";
  // A hash-only row predates the plaintext column, so its code can never be
  // read back. Say so plainly rather than dangling an issued-time next to a
  // code nobody can produce.
  if (!row.claimCode) return "Legacy code";
  if (row.codeGeneratedAt) {
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

            <ClaimCodeManager
              memberId={m.id}
              code={m.claimCode}
              hasCode={!!m.claimCode || !!m.claimCodeHash}
            />
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

type FranchiseOption = { id: string; name: string };

const FIELD_CLASS =
  "w-full min-w-0 rounded-[10px] border border-border bg-surface px-2.5 py-1.5 text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function RivalriesSection({
  rivalries,
  franchiseOptions,
  notice,
  error,
}: {
  rivalries: CommishRivalryRow[];
  franchiseOptions: FranchiseOption[];
  notice: keyof typeof RIVALRY_MESSAGES | null;
  error: keyof typeof RIVALRY_MESSAGES | null;
}) {
  return (
    <section id="rivalries" className="scroll-mt-24 space-y-4">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h2 className="text-h3 text-text-primary">Rivalries</h2>
        <span className="text-caption text-text-tertiary tabular-nums">
          {rivalries.length} named
        </span>
      </div>
      <p className="text-body-sm text-text-secondary">
        Name a grudge and it follows the pair across the site. Keep the lore
        true: no invented years or scores.
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-[10px] bg-accent-warm-light px-3 py-2 text-body-sm text-accent-warm"
        >
          {RIVALRY_MESSAGES[error]}
        </p>
      )}
      {notice && !error && (
        <p
          role="status"
          className="rounded-[10px] bg-accent-green-light px-3 py-2 text-body-sm text-accent-green"
        >
          {RIVALRY_MESSAGES[notice]}
        </p>
      )}

      <div className="space-y-2">
        {rivalries.map((r) => (
          <RivalryRow key={r.id} rivalry={r} franchiseOptions={franchiseOptions} />
        ))}
        {rivalries.length === 0 && (
          <p className="text-body-sm text-text-tertiary">
            No named rivalries yet. Everyone is getting along, allegedly.
          </p>
        )}
      </div>

      <form
        action={createRivalryAction}
        aria-label="Name a rivalry"
        className="card-surface space-y-4 p-4"
      >
        <p className="text-kicker">Name a rivalry</p>
        <RivalryFields idPrefix="new-rivalry" franchiseOptions={franchiseOptions} />
        <button
          type="submit"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Save rivalry
        </button>
      </form>
    </section>
  );
}

function RivalryRow({
  rivalry: r,
  franchiseOptions,
}: {
  rivalry: CommishRivalryRow;
  franchiseOptions: FranchiseOption[];
}) {
  return (
    <div className="card-surface space-y-3 p-4" data-rivalry-id={r.id}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="font-serif text-h3 italic text-text-primary">{r.name}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm text-text-secondary">
            <RivalrySide franchise={r.franchiseA} />
            <span className="text-caption text-text-tertiary">vs</span>
            <RivalrySide franchise={r.franchiseB} />
          </div>
          {r.tagline && (
            <p className="text-body-sm text-text-secondary">{r.tagline}</p>
          )}
          {r.origin && (
            <p className="text-body-sm text-text-tertiary">
              {r.origin}
            </p>
          )}
          {(r.originYear != null || r.trophyName) && (
            <p className="text-caption text-text-tertiary">
              {r.originYear != null && (
                <span className="font-mono tabular-nums">Since {r.originYear}</span>
              )}
              {r.originYear != null && r.trophyName && " · "}
              {r.trophyName && <span>Trophy: {r.trophyName}</span>}
            </p>
          )}
        </div>

        <form action={deleteRivalryAction} className="shrink-0">
          <input type="hidden" name="rivalryId" value={r.id} />
          <button
            type="submit"
            aria-label={`Delete ${r.name}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Delete
          </button>
        </form>
      </div>

      <details className="group rounded-[10px] border border-border">
        <summary className="cursor-pointer list-none px-3 py-2 text-body-sm text-text-secondary hover:text-text-primary">
          Edit {r.name}
        </summary>
        <form
          action={updateRivalryAction}
          aria-label={`Edit ${r.name}`}
          className="space-y-4 border-t border-border p-3"
        >
          <input type="hidden" name="rivalryId" value={r.id} />
          <RivalryFields
            idPrefix={`rivalry-${r.id}`}
            franchiseOptions={franchiseOptions}
            defaults={r}
          />
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Save changes
          </button>
        </form>
      </details>
    </div>
  );
}

function RivalrySide({ franchise: f }: { franchise: CommishRivalryRow["franchiseA"] }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <FranchiseLogo
        slug={f.slug}
        name={f.name}
        abbreviation={f.abbreviation ?? undefined}
        brandingColor={f.brandingColor ?? undefined}
        avatarUrl={f.avatarUrl}
        size={28}
        decorative
      />
      <span className="truncate text-text-primary">{f.name}</span>
    </span>
  );
}

/** The shared create/edit field set. Native <option> labels are plain text by
 *  design (an option cannot host a FranchiseLogo). */
function RivalryFields({
  idPrefix,
  franchiseOptions,
  defaults,
}: {
  idPrefix: string;
  franchiseOptions: FranchiseOption[];
  defaults?: CommishRivalryRow;
}) {
  const id = (field: string) => `${idPrefix}-${field}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Franchise" htmlFor={id("one")}>
        <select
          id={id("one")}
          name="franchiseOneId"
          required
          defaultValue={defaults?.franchiseAId ?? ""}
          className={FIELD_CLASS}
        >
          <option value="" disabled>
            Pick a franchise
          </option>
          {franchiseOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Rival" htmlFor={id("two")}>
        <select
          id={id("two")}
          name="franchiseTwoId"
          required
          defaultValue={defaults?.franchiseBId ?? ""}
          className={FIELD_CLASS}
        >
          <option value="" disabled>
            Pick a franchise
          </option>
          {franchiseOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name" htmlFor={id("name")}>
        <input
          id={id("name")}
          name="name"
          required
          maxLength={RIVALRY_LIMITS.name}
          defaultValue={defaults?.name ?? ""}
          placeholder="The Custody Battle"
          className={FIELD_CLASS}
        />
      </Field>
      <Field label="Trophy name (optional)" htmlFor={id("trophy")}>
        <input
          id={id("trophy")}
          name="trophyName"
          maxLength={RIVALRY_LIMITS.trophyName}
          defaultValue={defaults?.trophyName ?? ""}
          className={FIELD_CLASS}
        />
      </Field>
      <Field label="Tagline (optional)" htmlFor={id("tagline")} wide>
        <input
          id={id("tagline")}
          name="tagline"
          maxLength={RIVALRY_LIMITS.tagline}
          defaultValue={defaults?.tagline ?? ""}
          placeholder="One line for the cards."
          className={FIELD_CLASS}
        />
      </Field>
      <Field label="Origin (optional)" htmlFor={id("origin")} wide>
        <textarea
          id={id("origin")}
          name="origin"
          rows={3}
          maxLength={RIVALRY_LIMITS.origin}
          defaultValue={defaults?.origin ?? ""}
          placeholder="A sentence or two of lore. Keep it true."
          className={FIELD_CLASS}
        />
      </Field>
      <Field label="Origin year (optional)" htmlFor={id("year")}>
        <input
          id={id("year")}
          name="originYear"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          defaultValue={defaults?.originYear ?? ""}
          className={cn(FIELD_CLASS, "font-mono tabular-nums")}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <label htmlFor={htmlFor} className="text-caption text-text-tertiary">
        {label}
      </label>
      {children}
    </div>
  );
}
