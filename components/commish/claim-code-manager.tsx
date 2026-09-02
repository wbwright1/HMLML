"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { issueClaimCodeAction } from "@/app/commish/actions";
import { ISSUE_CODE_INITIAL } from "@/app/commish/claim-code-state";

interface ClaimCodeManagerProps {
  memberId: number;
  /** Plaintext code, or null for a legacy hash-only row / a member with none. */
  code: string | null;
  /** True when the member has a code at all, plaintext or legacy hash. */
  hasCode: boolean;
}

const MASK = "••••-••••-••••";

/**
 * Client island (admin-only tooling, outside the CLAUDE.md hub allowlist) for
 * the per-member claim-code controls. It exists for three pieces of local
 * state: the rotation result from useActionState, whether the code is
 * currently revealed, and the "Copied" flash.
 *
 * Codes are retrievable now, so nothing here is one-shot: /commish is dynamic
 * and commish-gated, so the page already ships the plaintext, and the mask is
 * shoulder-surf and screenshot hygiene rather than a security boundary. Copy
 * reads the prop and touches no server state at all, so it stays synchronous
 * inside the click handler (an awaited server action first would drop the
 * transient user activation Safari requires for clipboard writes).
 */
export function ClaimCodeManager({
  memberId,
  code,
  hasCode,
}: ClaimCodeManagerProps) {
  const [state, formAction, pending] = useActionState(
    issueClaimCodeAction,
    ISSUE_CODE_INITIAL,
  );
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [seenRotation, setSeenRotation] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drop a pending flash timer on unmount so it can't fire into a gone island.
  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  // A just-rotated code wins over the prop: the page revalidation lands a beat
  // later, and this avoids a flash of the superseded code.
  const rotated = state.code && state.memberId === memberId ? state.code : null;
  const currentCode = rotated ?? code;

  // Reveal a freshly rotated code without a second click; the commish just
  // asked for it. Adjusting state during render (rather than in an effect) is
  // the documented pattern for "derive from a changed prop", and it re-renders
  // before paint so the mask never flashes.
  if (rotated && rotated !== seenRotation) {
    setSeenRotation(rotated);
    setRevealed(true);
  }

  function copy() {
    if (!currentCode) return;
    // Optimistic label flip; the catch only keeps a rejected write (denied
    // clipboard permission) from surfacing as an unhandled rejection.
    navigator.clipboard.writeText(currentCode).catch(() => {});
    setCopied(true);
    // Restart the flash on every click. Without clearing, the previous click's
    // timer would fire mid-flash and blank the label on a copy that just
    // succeeded.
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {currentCode && (
          <>
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              aria-pressed={revealed}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              {revealed ? "Hide" : "Reveal"}
            </button>
            <button
              type="button"
              onClick={copy}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
            </button>
          </>
        )}
        {!currentCode && hasCode && (
          <span className="text-caption text-text-tertiary">
            Rotate to reveal
          </span>
        )}
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
      </div>

      {currentCode && (
        <div className="rounded-[10px] border border-accent-gold/40 bg-accent-gold-light px-3 py-2 text-right">
          <p className="font-mono text-body-lg font-bold tracking-[0.14em] text-accent-gold">
            {revealed ? currentCode : MASK}
          </p>
        </div>
      )}
      {state.error && state.memberId === null && (
        <p className="text-body-sm text-accent-warm">{state.error}</p>
      )}
    </div>
  );
}
