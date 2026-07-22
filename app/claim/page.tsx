import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { FranchiseLogo } from "@/components/franchise-logo";
import { getSessionMember } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { claimAction, signOutAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Claim your team | Harambe Memorial League Memorial League",
  description:
    "Enter your claim code to take control of your franchise and start talking.",
};

interface ClaimPageProps {
  searchParams: Promise<{ e?: string }>;
}

export default async function ClaimPage({ searchParams }: ClaimPageProps) {
  const { e } = await searchParams;
  const member = await getSessionMember();

  return (
    <section className="mx-auto flex max-w-[440px] flex-col items-stretch py-12 md:py-20">
      {member ? (
        <SignedInCard member={member} />
      ) : (
        <ClaimForm errorKind={e} />
      )}
    </section>
  );
}

const CLAIM_ERROR_COPY: Record<string, string> = {
  "1": "That code doesn’t match anything. Check with the commish.",
  slow: "Slow down. Try again in a minute.",
  expired: "That code has expired. Ask the commish for a fresh one.",
};

function ClaimForm({ errorKind }: { errorKind?: string }) {
  const errorMessage = errorKind ? CLAIM_ERROR_COPY[errorKind] : undefined;
  const hasError = Boolean(errorMessage);
  return (
    <div className="card-surface card-glows p-8">
      <p className="text-kicker">Take the wheel</p>
      <h1 className="text-h2 font-serif italic text-text-primary mt-2">
        Claim your team.
      </h1>
      <p className="text-body-sm text-text-secondary mt-3">
        The commish handed you a code. Punch it in and the franchise is yours:
        your crest, your feed, your receipts.
      </p>

      <form action={claimAction} className="mt-6 space-y-3">
        <label htmlFor="code" className="text-caption text-text-tertiary block">
          Claim code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          maxLength={32}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD-EFGH-JKMN"
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? "code-error" : undefined}
          className="h-11 w-full rounded-[10px] border border-border bg-surface px-3 font-mono text-base uppercase tracking-[0.12em] text-text-primary placeholder:text-text-muted placeholder:tracking-[0.12em] outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
        />
        {hasError && (
          <p id="code-error" className="text-body-sm text-accent-warm">
            {errorMessage}
          </p>
        )}
        <button
          type="submit"
          className={cn(buttonVariants({ size: "lg" }), "w-full")}
        >
          Claim my team
        </button>
      </form>
    </div>
  );
}

function SignedInCard({
  member,
}: {
  member: Awaited<ReturnType<typeof getSessionMember>>;
}) {
  if (!member) return null;
  const isCommish = member.role === "commish";

  return (
    <div className="card-surface card-glows p-8">
      <p className="text-kicker">You&apos;re in</p>
      <div className="mt-4 flex items-center gap-4">
        {member.franchiseSlug && member.franchiseName ? (
          <FranchiseLogo
            slug={member.franchiseSlug}
            name={member.franchiseName}
            avatarUrl={member.franchiseAvatarUrl}
            size="lg"
          />
        ) : null}
        <div className="min-w-0">
          <p className="text-h3 text-text-primary truncate">
            {member.franchiseName ?? "Unattached"}
          </p>
          <p className="text-body-sm text-text-tertiary truncate">
            {member.displayName}
            {isCommish ? " · Commissioner" : ""}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {isCommish && (
          <Link
            href="/commish"
            className={cn(buttonVariants({ size: "lg" }), "w-full")}
          >
            Open commish console
          </Link>
        )}
        <form action={signOutAction}>
          <button
            type="submit"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full",
            )}
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
