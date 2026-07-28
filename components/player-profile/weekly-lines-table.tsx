import Link from "next/link";
import { FranchiseLogo } from "@/components/franchise-logo";
import { MobileTableView } from "@/components/mobile-table-view";
import type {
  CuratedStatKey,
  PlayerWeeklyPointRow,
  PlayerWeeklyStatRow,
} from "@/lib/queries/player-profile";

interface StatColumn {
  key: CuratedStatKey;
  label: string;
}

const STAT_COLUMNS_BY_POSITION: Record<string, StatColumn[]> = {
  QB: [
    { key: "passYd", label: "Pass Yd" },
    { key: "passTd", label: "Pass TD" },
    { key: "passInt", label: "INT" },
    { key: "rushYd", label: "Rush Yd" },
    { key: "rushTd", label: "Rush TD" },
  ],
  RB: [
    { key: "rushAtt", label: "Att" },
    { key: "rushYd", label: "Rush Yd" },
    { key: "rushTd", label: "Rush TD" },
    { key: "rec", label: "Rec" },
  ],
  WR: [
    { key: "recTgt", label: "Tgt" },
    { key: "rec", label: "Rec" },
    { key: "recYd", label: "Rec Yd" },
    { key: "recTd", label: "Rec TD" },
  ],
  TE: [
    { key: "recTgt", label: "Tgt" },
    { key: "rec", label: "Rec" },
    { key: "recYd", label: "Rec Yd" },
    { key: "recTd", label: "Rec TD" },
  ],
  K: [
    { key: "fgm", label: "FGM" },
    { key: "fga", label: "FGA" },
    { key: "xpm", label: "XPM" },
  ],
};

interface WeeklyLinesTableProps {
  playerId: string;
  position: string | null;
  seasonsPresent: number[];
  selectedSeason: number | null;
  weeklyPoints: PlayerWeeklyPointRow[];
  weeklyStats: PlayerWeeklyStatRow[];
}

function SeasonPicker({
  playerId,
  seasonsPresent,
  selectedSeason,
}: {
  playerId: string;
  seasonsPresent: number[];
  selectedSeason: number | null;
}) {
  if (seasonsPresent.length <= 1) return null;
  return (
    <nav aria-label="Season" className="flex gap-2 overflow-x-auto pb-1">
      {seasonsPresent.map((year) => {
        const isActive = year === selectedSeason;
        return (
          <Link
            key={year}
            href={`/players/${playerId}?season=${year}`}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-body-sm font-medium tabular-nums transition-colors ${
              isActive
                ? "border-accent-gold/30 bg-accent-gold-light text-accent-gold"
                : "border-border bg-surface text-text-tertiary hover:text-text-primary"
            }`}
          >
            {year}
          </Link>
        );
      })}
    </nav>
  );
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-text-tertiary">&ndash;</span>;
  if (delta === 0) return <span className="font-mono tabular-nums text-text-secondary">0.0</span>;
  const beat = delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono tabular-nums ${
        beat ? "text-accent-green" : "text-accent-warm"
      }`}
    >
      <span aria-hidden="true">{beat ? "▲" : "▼"}</span>
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}

/**
 * The season's week-by-week line: points + slot + (once player_week_stats is
 * backfilled) position-appropriate stat columns. Renders points-only columns
 * gracefully when weeklyStats is empty (pre-backfill).
 */
export function WeeklyLinesTable({
  playerId,
  position,
  seasonsPresent,
  selectedSeason,
  weeklyPoints,
  weeklyStats,
}: WeeklyLinesTableProps) {
  const statColumns = position ? (STAT_COLUMNS_BY_POSITION[position] ?? []) : [];
  const statsByWeek = new Map(weeklyStats.map((s) => [s.week, s]));

  const headers = [
    "Week",
    "Opponent",
    "Slot",
    "Status",
    "Proj",
    "Actual",
    "Δ",
    ...(weeklyStats.length > 0 ? statColumns.map((c) => c.label) : []),
  ];

  const rows = weeklyPoints.map((w) => {
    const delta = w.projectedPoints != null ? w.points - w.projectedPoints : null;
    const stat = statsByWeek.get(w.week);

    const opponentCell = w.opponentFranchiseName ? (
      <span className="inline-flex items-center gap-1.5">
        <FranchiseLogo
          slug={w.opponentFranchiseSlug ?? ""}
          name={w.opponentFranchiseName}
          size={20}
          decorative
        />
        {w.opponentFranchiseName}
      </span>
    ) : (
      <span className="text-text-tertiary">&ndash;</span>
    );

    const statusCell = w.started ? (
      <span className="font-medium text-text-primary">START</span>
    ) : (
      <span className="text-text-tertiary">BENCH</span>
    );

    const row: (string | number | React.ReactNode)[] = [
      w.week,
      opponentCell,
      w.slot ?? "–",
      statusCell,
      w.projectedPoints != null ? w.projectedPoints.toFixed(1) : "–",
      w.points.toFixed(1),
      <DeltaCell key="delta" delta={delta} />,
    ];

    if (weeklyStats.length > 0) {
      for (const col of statColumns) {
        const value = stat ? stat[col.key] : null;
        row.push(value != null ? value.toString() : "–");
      }
    }

    return row;
  });

  return (
    <div className="space-y-4">
      <SeasonPicker
        playerId={playerId}
        seasonsPresent={seasonsPresent}
        selectedSeason={selectedSeason}
      />
      {rows.length === 0 ? (
        <p className="text-body-sm text-text-tertiary">
          No weekly lines recorded for this season.
        </p>
      ) : (
        <MobileTableView headers={headers} rows={rows} primaryColumn={0} />
      )}
    </div>
  );
}
