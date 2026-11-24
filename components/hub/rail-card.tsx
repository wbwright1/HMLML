import type { ReactNode } from "react";

/**
 * The hub's spacing contract, in one place (issue #291).
 *
 * Before this file every hub block invented its own rhythm: four sibling rail
 * cards used four different row paddings, two different separator tokens, and
 * two different kicker-to-card gaps depending on which column they sat in. The
 * three components here own those three decisions so a card cannot reintroduce
 * a fifth rhythm. All server components; no client JS.
 */

/**
 * A hub block: its one sentence-case label (the section's h2), an optional
 * right-aligned action/meta node, and the card(s) below it. 16px between the kicker and its content, in every
 * column, so the two columns start their first card on the same line.
 */
export function HubSection({
  kicker,
  action,
  id,
  className = "",
  children,
}: {
  /** The module's one label: 12px sentence case, rendered as its h2. */
  kicker: ReactNode;
  /** Anchor id for in-page links (e.g. the hero's "Box scores"). */
  id?: string;
  /** Right-aligned link or meta line on the kicker row (baseline-aligned). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`space-y-4 ${className}`.trim()}>
      {action ? (
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h2 className="text-kicker">{kicker}</h2>
          {action}
        </div>
      ) : (
        <h2 className="text-kicker">{kicker}</h2>
      )}
      {children}
    </section>
  );
}

/**
 * The hub's tappable list rows (final scores, Team of the week, the slate,
 * "More this week"): one link per row, at least 44px tall, a hairline between
 * rows, press feedback and the shared focus ring. Rows carry their own
 * padding, so unlike RailRows the container adds none.
 */
export const HUB_ROW_LINK =
  "flex min-h-11 items-center gap-3 px-4 py-3 first:rounded-t-[var(--radius)] last:rounded-b-[var(--radius)] transition-[scale,background-color] duration-150 hover:bg-surface-muted active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

/** A card holding HUB_ROW_LINK rows, divided by hairlines, flush to its edges. */
export function LinkRows({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`card-surface divide-y divide-divider ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * The rail / secondary card shell: 24px padding, one value for every card in
 * the rail. Deliberately has no padding variant; one padding value is the
 * point.
 *
 * `tinted` uses `.card-tint-gold` from globals.css, the shipped tint variant
 * whose stops are exactly the gold wash the Left On The Bench callout used to
 * inline as a literal gradient in an absolutely-positioned overlay div. The
 * class is the shared definition; the literal was a duplicate of it.
 */
export function RailCard({
  children,
  tinted = false,
}: {
  children: ReactNode;
  tinted?: boolean;
}) {
  return (
    <div
      className={`card-surface relative overflow-hidden p-6 ${
        tinted ? "card-tint-gold" : ""
      }`.trim()}
    >
      {children}
    </div>
  );
}

/**
 * Row stack inside a rail card: 16px of breathing room on each side of the
 * hairline, flush to the card's own padding at the ends. Padding is the ONLY
 * separation mechanism here; the mixed `space-y-*` margin plus `pt-*` padding
 * straddling the rule (which League Moves and Players to Watch both used) is
 * what made those two cards read as differently spaced from their siblings.
 */
export function RailRows({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="rail-rows"
      className={`divide-y divide-divider [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
