"use client";

import { useActionState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { issueClaimCodeAction } from "@/app/commish/actions";
import { ISSUE_CODE_INITIAL } from "@/app/commish/claim-code-state";

interface ClaimCodeManagerProps {
  memberId: number;
  hasCode: boolean;
}

/**
 * Minimal client island (the ONE `"use client"` outside the CLAUDE.md hub
 * allowlist, in admin-only tooling). Its sole reason to exist: a claim code is
 * shown in plaintext exactly ONCE, right after it's issued, and the only
 * RSC-friendly way to surface a server action's return value without stashing
 * the secret in the URL or the database is useActionState. On success the
 * revealed code renders inline here; a page refresh (or acting on any other
 * member) clears it, matching the "shown once" contract.
 */
export function ClaimCodeManager({ memberId, hasCode }: ClaimCodeManagerProps) {
  const [state, formAction, pending] = useActionState(
    issueClaimCodeAction,
    ISSUE_CODE_INITIAL,
  );

  const revealed = state.code && state.memberId === memberId ? state.code : null;

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="memberId" value={memberId} />
        <button
          type="submit"
          disabled={pending}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {pending ? "Working…" : hasCode ? "Rotate code" : "Generate code"}
        </button>
      </form>

      {revealed && (
        <div className="rounded-[10px] border border-accent-gold/40 bg-accent-gold-light px-3 py-2 text-right">
          <p className="text-caption text-text-tertiary">Shown once</p>
          <p className="font-mono text-body-lg font-bold tracking-[0.14em] text-accent-gold">
            {revealed}
          </p>
        </div>
      )}
      {state.error && state.memberId === null && (
        <p className="text-body-sm text-accent-warm">{state.error}</p>
      )}
    </div>
  );
}
