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
 * A hub block: its kicker eyebrow, an optional right-aligned action/meta node,
 * and the card(s) below it. 16px between the kicker and its content, in every
 * column, so the two columns start their first card on the same line.
 */
export function HubSection({
  kicker,
  action,
  className = "",
  children,
}: {
  kicker: ReactNode;
  /** Right-aligned link or meta line on the kicker row (baseline-aligned). */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`space-y-4 ${className}`.trim()}>
      {action ? (
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-kicker">{kicker}</p>
          {action}
        </div>
      ) : (
        <p className="text-kicker">{kicker}</p>
      )}
      {children}
    </section>
  );
}

/**
 * The rail / secondary card shell: 24px padding, one value for every card in
 * the rail. Deliberately has no padding variant; one padding value is the
 * point. `tinted` layers the existing gold gradient wash (existing tokens, not
 * a new one) used by the Left On The Bench callout.
 */
export function RailCard({
  children,
  tinted = false,
}: {
  children: ReactNode;
  tinted?: boolean;
}) {
  return (
    <div className="card-surface relative overflow-hidden p-6">
      {tinted && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(226,184,88,0.10), rgba(226,184,88,0.02))",
          }}
        />
      )}
      <div className="relative">{children}</div>
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
