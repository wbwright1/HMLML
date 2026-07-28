"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { X } from "lucide-react";

interface ProfileModalShellProps {
  children: React.ReactNode;
}

/**
 * The sole client island for the player-profile feature: the intercepted-route
 * modal chrome around <PlayerProfile variant="modal" />. Desktop renders a
 * centered card-surface panel; mobile renders a full-screen bottom sheet.
 * Dismiss (backdrop click, Escape, close button) calls router.back() so the
 * URL and the underlying page both restore correctly.
 */
export function ProfileModalShell({ children }: ProfileModalShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = () => router.back();

  // Entrance transition: mount in the "before" state, flip to "after" on the
  // next frame so the transition actually runs. No exit animation (per spec).
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Scroll lock while the modal is open.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Focus the close button on mount, then trap Tab within the dialog.
  useEffect(() => {
    closeButtonRef.current?.focus();
    const dialog = dialogRef.current;
    if (!dialog) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = Array.from(
        dialog!.querySelectorAll<HTMLElement>(
          'a[href], button, input, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] transition-opacity duration-150 ease-out ${
        mounted ? "opacity-100" : "opacity-0"
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-profile-title"
        className={`card-surface fixed overflow-y-auto transition-transform duration-150 ease-out
          inset-x-0 bottom-0 top-[env(safe-area-inset-top)] rounded-t-[14px] rounded-b-none
          pb-[calc(env(safe-area-inset-bottom)+16px)]
          ${mounted ? "translate-y-0" : "translate-y-full"}
          lg:inset-auto lg:top-1/2 lg:left-1/2 lg:bottom-auto lg:-translate-x-1/2 lg:rounded-[14px]
          lg:w-[calc(100vw-64px)] lg:max-w-[860px] lg:max-h-[calc(100vh-96px)]
          ${mounted ? "lg:-translate-y-1/2" : "lg:translate-y-[calc(-50%+8px)]"}
        `}
      >
        <div className="sticky top-0 z-10 flex items-center justify-end gap-2 border-b border-divider bg-canvas/95 px-4 py-3 backdrop-blur-sm">
          {/*
            Plain anchor, not next/link: we're already at this pathname (the
            modal intercepts it), so a client-side Link nav would be a no-op.
            A hard navigation is what actually lands on the canonical full page.
          */}
          <a
            href={pathname}
            className="hidden sm:inline text-caption text-text-tertiary hover:text-accent-gold transition-colors"
          >
            Open full page
          </a>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-muted hover:text-text-primary transition-colors"
          >
            <X className="size-5" strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
