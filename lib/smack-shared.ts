// Pure, dependency-free smack constants and action-state shape shared across the
// server action, the client composer island, and the DB query layer. Kept free
// of any `db`/`pg` import so it is safe to pull into a client bundle (the
// composer needs the char cap and the initial action state).

/** Server-enforced ceiling on a member smack post; mirrored by the composer. */
export const SMACK_MAX_LENGTH = 280;

export interface SmackActionState {
  error: string | null;
  /** Increments on each successful post so the client can reset its field. */
  ok: number;
}

export const SMACK_ACTION_INITIAL: SmackActionState = { error: null, ok: 0 };
