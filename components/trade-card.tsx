import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { TeamLink } from "@/components/team-link";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { PositionBadge } from "@/components/position-badge";
import { PlayerHeadshot } from "@/components/player-headshot";
import { PlayerLink } from "@/components/player-link";
import type { Trade } from "@/lib/queries/trades";
import type { TradeGrade } from "@/lib/queries/trade-grades";
import type { TradeValueSummary } from "@/lib/queries/trade-values";

interface TradeCardProps {
  trade: Trade;
  /**
   * Optional Site Desk "who won this trade" aside, keyed to this trade's
   * transaction id upstream. Rendered as a serif italic editorial note.
   */
  verdict?: string | null;
  /** Optional hindsight grade (realized-points report) for this trade. */
  grade?: TradeGrade | null;
  /** Optional dynasty market values per side. Purely presentational; never feeds grades. */
  values?: TradeValueSummary | null;
  /**
   * True when this card is the target of a `?highlight=` deep link. Applies
   * the `trade-focus` gold ring + tint-flash location cue (see globals.css).
   */
  highlighted?: boolean;
}

function gradeChipClasses(letter: string): string {
  if (letter.startsWith("A")) return "bg-accent-gold-light text-accent-gold";
  if (letter === "D" || letter === "F")
    return "bg-accent-warm-light text-accent-warm";
  return "bg-surface-muted text-text-secondary";
}

function labelVariant(
  tone: TradeGrade["labelTone"]
): "gold" | "green" | "brown" | "neutral" {
  if (tone === "positive") return "green";
  if (tone === "sting") return "brown";
  return "neutral";
}

export function TradeCard({
  trade,
  verdict,
  grade,
  values,
  highlighted,
}: TradeCardProps) {
  return (
    <div
      id={`trade-${trade.id}`}
      className={`card-surface p-5 space-y-4 scroll-mt-24${highlighted ? " trade-focus" : ""}`}
    >

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <SuperlativeBadge text="Trade" variant="gold" />
          <span className="text-body-sm text-text-tertiary font-mono tabular-nums">
            {trade.date}
          </span>
          <span className="text-body-sm text-text-tertiary">{trade.seasonYear}</span>
        </div>
        {trade.week != null && (
          <span className="text-caption text-text-tertiary font-mono tabular-nums">
            Week {trade.week}
          </span>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-stretch gap-4">
        {trade.sides.map((side, index) => (
          <div key={side.rosterId} className="flex flex-1 items-stretch gap-4">
            <div className="flex-1 rounded-[10px] border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center gap-2">
                {side.franchise ? (
                  <>
                    <Link
                      href={`/teams/${side.franchise.slug}`}
                      className="flex min-w-0 items-center gap-2 transition-colors hover:text-accent-gold"
                    >
                      <FranchiseLogo
                        slug={side.franchise.slug}
                        name={side.franchise.name}
                        abbreviation={side.franchise.abbreviation}
                        brandingColor={side.franchise.brandingColor}
                        avatarUrl={side.franchise.avatarUrl}
                        size="sm"
                      />
                      <span className="min-w-0 truncate text-body-sm font-semibold text-text-primary">
                        {side.franchise.name}
                      </span>
                    </Link>
                    <p className="text-caption text-text-tertiary">Received</p>
                  </>
                ) : (
                  <div className="min-w-0">
                    <span className="text-body-sm font-semibold text-text-primary">
                      Unknown Team
                    </span>
                    <p className="text-caption text-text-tertiary">Received</p>
                  </div>
                )}
              </div>

              {side.players.length === 0 && side.picks.length === 0 ? (
                <p className="text-body-sm text-text-tertiary">Nothing (cash/FAAB only)</p>
              ) : (
                <ul className="space-y-2">
                  {side.players.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center gap-2 text-body-sm text-text-secondary"
                    >
                      <PlayerLink playerId={player.id} className="flex items-center gap-2 min-w-0">
                        <PlayerHeadshot
                          size={34}
                          playerId={player.id}
                          name={player.name}
                          nflTeam={player.nflTeam}
                          showTeamBadge={false}
                        />
                        <PositionBadge position={player.position} />
                        <span className="truncate">{player.name}</span>
                      </PlayerLink>
                      {player.nflTeam && (
                        <span className="text-caption font-mono text-text-tertiary">
                          {player.nflTeam}
                        </span>
                      )}
                    </li>
                  ))}
                  {side.picks.map((pick, pickIndex) => (
                    <li
                      key={`${pick.season}-${pick.round}-${pickIndex}`}
                      className="flex flex-col gap-1 text-body-sm text-text-secondary"
                    >
                      <div className="flex items-center gap-2">
                        {pick.originalFranchise && (
                          <TeamLink
                            slug={pick.originalFranchise.slug}
                            aria-label={pick.originalFranchise.name}
                            className="inline-flex shrink-0"
                          >
                            <FranchiseLogo
                              slug={pick.originalFranchise.slug}
                              name={pick.originalFranchise.name}
                              abbreviation={pick.originalFranchise.abbreviation}
                              brandingColor={pick.originalFranchise.brandingColor}
                              avatarUrl={pick.originalFranchise.avatarUrl}
                              size={20}
                              decorative
                            />
                          </TeamLink>
                        )}
                        <span
                          className={`font-mono tabular-nums ${pick.voided ? "text-text-muted line-through" : "text-accent-gold"}`}
                        >
                          {pick.season}
                        </span>
                        <span className={pick.voided ? "text-text-muted line-through" : undefined}>
                          Round {pick.round} pick
                        </span>
                        {pick.voided && (
                          <SuperlativeBadge text="Voided" variant="brown" />
                        )}
                      </div>
                      {pick.voided ? (
                        <p className="pl-1 text-caption text-text-tertiary">
                          Never conveyed. The 2023 redraft reset the board.
                        </p>
                      ) : pick.flippedToTradeId != null ? (
                        <Link
                          href={`/trades?highlight=${pick.flippedToTradeId}#trade-${pick.flippedToTradeId}`}
                          className="w-fit pl-1 text-caption text-accent-gold hover:underline"
                        >
                          flipped in a later trade &rarr;
                        </Link>
                      ) : pick.became && (
                        <div className="flex min-w-0 items-center gap-1.5 pl-1 text-caption text-text-tertiary">
                          <span className="shrink-0">became</span>
                          <PlayerLink
                            playerId={pick.became.id}
                            className="flex min-w-0 items-center gap-1.5"
                          >
                            <PlayerHeadshot
                              size={22}
                              playerId={pick.became.id}
                              name={pick.became.name}
                              showTeamBadge={false}
                            />
                            <span className="truncate text-text-secondary">
                              {pick.became.name}
                            </span>
                          </PlayerLink>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {index < trade.sides.length - 1 && (
              <div
                className="hidden md:flex items-center justify-center text-text-tertiary text-lg"
                aria-hidden="true"
              >
                &#8644;
              </div>
            )}
          </div>
        ))}
      </div>

      {grade && (
        <div className="border-t border-divider pt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`text-kicker ${grade.graded ? "text-accent-gold" : "text-text-tertiary"}`}
            >
              {grade.graded ? "Hindsight Report" : "Hindsight Pending"}
            </p>
            {grade.label && (
              <SuperlativeBadge
                text={grade.label}
                variant={labelVariant(grade.labelTone)}
              />
            )}
          </div>
          {grade.graded ? (
            <ul className="space-y-1.5">
              {grade.sides.map((s) => {
                const side = trade.sides.find((ts) => ts.rosterId === s.rosterId);
                return (
                  <li
                    key={s.rosterId}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm"
                  >
                    <span
                      className={`inline-flex w-8 justify-center rounded-md px-1.5 py-0.5 font-mono font-bold tabular-nums ${gradeChipClasses(s.grade ?? "")}`}
                    >
                      {s.grade}
                    </span>
                    <TeamLink
                      slug={side?.franchise?.slug}
                      className="text-text-secondary font-semibold truncate"
                    >
                      {side?.franchise?.name ?? "Unknown Team"}
                    </TeamLink>
                    <span className="text-caption font-mono tabular-nums text-text-tertiary">
                      {s.realizedPoints.toFixed(1)} pts realized &middot;{" "}
                      {s.startedPoints.toFixed(1)} started
                      {s.flipCreditPoints >= 0.5 && (
                        <> &middot; {s.flipCreditPoints.toFixed(1)} via flips</>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-body-sm text-text-secondary">{grade.message}</p>
          )}
        </div>
      )}

      {values && values.sides.some((s) => s.coverage !== "none") && (
        <div className="border-t border-divider pt-3 space-y-2">
          <p className="text-kicker text-text-tertiary">Dynasty Value &middot; Then &rarr; Now</p>
          <ul className="space-y-1.5">
            {values.sides.map((s) => {
              const side = trade.sides.find((ts) => ts.rosterId === s.rosterId);
              const name = side?.franchise?.name ?? "Unknown Team";
              const delta =
                s.coverage === "full" && s.then !== null && s.now !== null
                  ? s.now - s.then
                  : null;
              return (
                <li
                  key={s.rosterId}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm"
                >
                  <TeamLink
                    slug={side?.franchise?.slug}
                    className="text-text-secondary font-semibold truncate"
                  >
                    {name}
                  </TeamLink>
                  {s.coverage === "none" && (
                    <span className="text-caption text-text-muted">no market data</span>
                  )}
                  {s.coverage === "partial" && (
                    <>
                      <span className="font-mono tabular-nums text-text-primary">
                        {s.now!.toLocaleString()}
                      </span>
                      <span className="text-caption text-text-tertiary">current value</span>
                    </>
                  )}
                  {s.coverage === "full" && (
                    <>
                      <span className="font-mono tabular-nums text-text-tertiary">
                        {s.then!.toLocaleString()}
                      </span>
                      <span className="px-1.5 text-text-muted" aria-hidden>
                        &rarr;
                      </span>
                      <span className="font-mono tabular-nums text-text-primary">
                        {s.now!.toLocaleString()}
                      </span>
                      {delta === 0 ? (
                        <span className="text-caption text-text-muted">no change</span>
                      ) : delta !== null && delta > 0 ? (
                        <span className="flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums text-accent-green shrink-0">
                          <span className="sr-only">up </span>
                          <span aria-hidden>▲</span>
                          <span>{delta.toLocaleString()}</span>
                        </span>
                      ) : delta !== null ? (
                        <span className="flex items-center gap-0.5 font-mono text-xs tabular-nums text-accent-warm shrink-0">
                          <span className="sr-only">down </span>
                          <span aria-hidden>▼</span>
                          <span>{Math.abs(delta).toLocaleString()}</span>
                        </span>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {verdict && (
        <div className="border-t border-divider pt-3">
          <p className="text-kicker text-accent-gold mb-1">Site Desk Verdict</p>
          <p className="font-serif italic text-body text-text-secondary">
            {verdict}
          </p>
        </div>
      )}
    </div>
  );
}
