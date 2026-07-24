"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SuperlativeCard } from "@/components/superlative-card";
import { PageSection } from "@/components/page-section";
import { LeaderboardTable } from "@/app/records/leaderboard-table";
import type { LeaderboardEntry } from "@/lib/queries/records";
import type { SeasonSuperlative } from "@/lib/queries/superlatives";

interface RecordsSeasonViewProps {
  allTimeData: LeaderboardEntry[];
  seasonData: Record<string, LeaderboardEntry[]>;
  seasonYears: number[];
  projectionSeasonYear?: number | null;
  projectionFieldIds?: string[];
  /**
   * Superlative cards keyed by scope: String(year) for a season, "all-time"
   * for the all-time extremes. Looked up by the active season tab so the
   * grid below the standings stays in sync with whichever tab is selected.
   */
  superlativesByScope: Record<string, SeasonSuperlative[]>;
  /** Server-rendered right rail (Record Book, playoff projection, etc). */
  rail: React.ReactNode;
}

/**
 * Owns the shared activeSeason tab state for the records page: the
 * LeaderboardTable's season pills and the superlatives grid below it stay in
 * sync, since both read from the same selected season here.
 */
export function RecordsSeasonView({
  allTimeData,
  seasonData,
  seasonYears,
  projectionSeasonYear,
  projectionFieldIds,
  superlativesByScope,
  rail,
}: RecordsSeasonViewProps) {
  const [activeSeason, setActiveSeason] = useState<number | "all-time">(
    "all-time"
  );

  const scopeKey = activeSeason === "all-time" ? "all-time" : String(activeSeason);
  const superlativeCards = superlativesByScope[scopeKey] ?? [];

  return (
    <div className="pb-12 md:pb-16">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 lg:gap-10 items-start">
        {/* Main: full standings + superlatives */}
        <div className="min-w-0">
          <LeaderboardTable
            allTimeData={allTimeData}
            seasonData={seasonData}
            seasonYears={seasonYears}
            projectionSeasonYear={projectionSeasonYear}
            projectionFieldIds={projectionFieldIds}
            activeSeason={activeSeason}
            onSeasonSelect={setActiveSeason}
          />

          {superlativeCards.length > 0 && (
            <ScrollReveal>
              <PageSection
                label={
                  activeSeason === "all-time"
                    ? "All-Time Awards"
                    : `Season Awards · ${activeSeason}`
                }
                title="The Superlatives"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 items-stretch">
                  {superlativeCards.map((s) => (
                    <SuperlativeCard
                      key={s.franchiseSlug}
                      label={s.displayText}
                      stat={s.stat}
                      context={s.context}
                      franchiseName={s.franchiseName}
                      franchiseSlug={s.franchiseSlug}
                      tone={s.tone}
                    />
                  ))}
                </div>
              </PageSection>
            </ScrollReveal>
          )}
        </div>

        {/* Right rail */}
        <div className="space-y-8">{rail}</div>
      </div>
    </div>
  );
}
