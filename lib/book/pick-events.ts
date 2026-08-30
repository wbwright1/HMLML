// The Book: a same-tab invalidation signal fired after a pick is placed
// through app/actions/book.ts's togglePick.
//
// The flow is TWO-WAY. Both the Board (components/book/board-island.tsx) and
// the Tracking tab's pick'ems strip (components/book/tracking-island.tsx) book
// picks through the same server action, and both read the member's own slip
// from /api/book/picks. components/book/book-tabs.tsx keeps every pane
// permanently mounted (toggled via a `hidden` attribute, never unmounted), so
// each island would otherwise run that fetch exactly once, on first mount,
// before any pick existed. Without this signal a pick made on either tab would
// never reach the other until a full reload, which breaks the "you can always
// see your own slip" guarantee for the normal flow: pick, switch tabs, check.
//
// So each island both FIRES this after a successful action and SUBSCRIBES to
// refetch on it.
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
