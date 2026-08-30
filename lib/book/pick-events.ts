// The Book: a same-tab invalidation signal fired after a pick is placed
// through the Board's server action (app/actions/book.ts's togglePick).
//
// components/book/book-tabs.tsx keeps every pane permanently mounted (toggled
// via a `hidden` attribute, never unmounted), so components/book/tracking-island.tsx
// only ever runs its /api/book/picks fetch once, on that first mount, before
// the viewer has placed any pick. Without this signal, a pick placed on the
// Board tab afterward would never reach the Tracking tab's own-picks overlay,
// which breaks the "you can always see your own slip" guarantee for the
// normal user flow: pick, then switch tabs to check it.
//
// A tiny module-level pub/sub rather than React context: the Board and
// Tracking islands are unrelated siblings under BookTabs, and neither needs
// to know the other exists beyond "something changed, go refetch".

type Listener = () => void;

const listeners = new Set<Listener>();

/** Call after a pick-changing server action (togglePick, lockSlip) succeeds. */
export function notifyBookPicksChanged(): void {
  for (const listener of listeners) listener();
}

/** Returns an unsubscribe function, for use inside a useEffect cleanup. */
export function subscribeToBookPicksChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
