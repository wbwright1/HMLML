import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { PositionBadge } from "@/components/position-badge";
import type { Trade } from "@/lib/queries/trades";

interface TradeCardProps {
  trade: Trade;
}

export function TradeCard({ trade }: TradeCardProps) {
  return (
    <div className="card-surface p-5 space-y-4">
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
                    <FranchiseLogo
                      slug={side.franchise.slug}
                      name={side.franchise.name}
                      abbreviation={side.franchise.abbreviation}
                      brandingColor={side.franchise.brandingColor}
                      avatarUrl={side.franchise.avatarUrl}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <Link
                        href={`/teams/${side.franchise.slug}`}
                        className="text-body-sm font-semibold text-text-primary hover:text-accent-gold transition-colors truncate block"
                      >
                        {side.franchise.name}
                      </Link>
                      <p className="text-caption text-text-tertiary">Received</p>
                    </div>
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
                <ul className="space-y-1.5">
                  {side.players.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center gap-2 text-body-sm text-text-secondary"
                    >
                      <PositionBadge position={player.position} />
                      <span className="truncate">{player.name}</span>
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
                      className="flex items-center gap-2 text-body-sm text-text-secondary"
                    >
                      <span className="font-mono tabular-nums text-accent-gold">
                        {pick.season}
                      </span>
                      <span>Round {pick.round} pick</span>
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
    </div>
  );
}
