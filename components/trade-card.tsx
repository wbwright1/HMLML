import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { SuperlativeBadge } from "@/components/superlative-badge";
import { PositionBadge } from "@/components/position-badge";
import { PlayerHeadshot } from "@/components/player-headshot";
import type { Trade } from "@/lib/queries/trades";

interface TradeCardProps {
  trade: Trade;
  /**
   * Optional Site Desk "who won this trade" aside, keyed to this trade's
   * transaction id upstream. Rendered as a serif italic editorial note.
   */
  verdict?: string | null;
}

export function TradeCard({ trade, verdict }: TradeCardProps) {
  return (
    <div id={`trade-${trade.id}`} className="card-surface p-5 space-y-4 scroll-mt-24">
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
                <ul className="space-y-2">
                  {side.players.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center gap-2 text-body-sm text-text-secondary"
                    >
                      <PlayerHeadshot
                        size={34}
                        playerId={player.id}
                        name={player.name}
                        nflTeam={player.nflTeam}
                        showTeamBadge={false}
                      />
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
                      className="flex flex-col gap-1 text-body-sm text-text-secondary"
                    >
                      <div className="flex items-center gap-2">
                        {pick.originalFranchise && (
                          <FranchiseLogo
                            slug={pick.originalFranchise.slug}
                            name={pick.originalFranchise.name}
                            abbreviation={pick.originalFranchise.abbreviation}
                            brandingColor={pick.originalFranchise.brandingColor}
                            avatarUrl={pick.originalFranchise.avatarUrl}
                            size={20}
                            decorative
                          />
                        )}
                        <span className="font-mono tabular-nums text-accent-gold">
                          {pick.season}
                        </span>
                        <span>Round {pick.round} pick</span>
                      </div>
                      {pick.flippedToTradeId != null ? (
                        <Link
                          href={`/trades#trade-${pick.flippedToTradeId}`}
                          className="w-fit pl-1 text-caption text-accent-gold hover:underline"
                        >
                          flipped in a later trade &rarr;
                        </Link>
                      ) : pick.became && (
                        <div className="flex min-w-0 items-center gap-1.5 pl-1 text-caption text-text-tertiary">
                          <span className="shrink-0">became</span>
                          <PlayerHeadshot
                            size={22}
                            playerId={pick.became.id}
                            name={pick.became.name}
                            showTeamBadge={false}
                          />
                          <span className="truncate text-text-secondary">
                            {pick.became.name}
                          </span>
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
