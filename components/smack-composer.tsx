"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  SMACK_MAX_LENGTH,
  SMACK_ACTION_INITIAL,
  type SmackActionState,
} from "@/lib/smack-shared";
import { postSmack } from "@/app/actions/smack";

/**
 * Compact smack composer for signed-in members. A NEW client island (enumerated
 * in CLAUDE.md's island list): the live character counter and the pending
 * submit state are the only reasons this needs client JS. Wraps the postSmack
 * server action, which re-enforces every rule the UI shows here.
 */
export function SmackComposer() {
  const [state, formAction] = useActionState<SmackActionState, FormData>(
    postSmack,
    SMACK_ACTION_INITIAL,
  );
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmedLength = text.trim().length;
  const over = text.length > SMACK_MAX_LENGTH;
  const canSubmit = trimmedLength > 0 && !over;

  // Reset the field after a successful post (state.ok increments each success).
  useEffect(() => {
    if (state.ok > 0) {
      setText("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
  }, [state.ok]);

  // Single-line field that grows with content.
  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  return (
    <form action={formAction} className="card-surface p-4">
      <textarea
        ref={textareaRef}
        name="body"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          autoGrow(e.target);
        }}
        rows={1}
        maxLength={SMACK_MAX_LENGTH}
        placeholder="Talk your talk. The whole league is watching."
        aria-label="Write a smack post"
        className="w-full resize-none bg-transparent text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          className={`text-caption tabular-nums font-mono ${
            over ? "text-accent-warm" : "text-text-tertiary"
          }`}
          aria-live="polite"
        >
          {text.length}/{SMACK_MAX_LENGTH}
        </span>
        <div className="flex items-center gap-3">
          {state.error && (
            <span className="text-caption text-accent-warm normal-case tracking-normal">
              {state.error}
            </span>
          )}
          <SubmitButton disabled={!canSubmit} />
        </div>
      </div>
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-full bg-accent-gold px-4 py-1.5 text-body-sm font-semibold text-canvas transition-[filter] duration-150 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Posting…" : "Post"}
    </button>
  );
}
