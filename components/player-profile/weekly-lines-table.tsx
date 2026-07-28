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
  variant: "modal" | "page";
}

function SeasonPicker({
  playerId,
  seasonsPresent,
  selectedSeason,
  variant,
}: {
  playerId: string;
  seasonsPresent: number[];
  selectedSeason: number | null;
  variant: "modal" | "page";
}) {
  if (seasonsPresent.length <= 1) return null;
  return (
    <nav aria-label="Season" className="flex gap-2 overflow-x-auto pb-1">
      {seasonsPresent.map((year) => {
        const isActive = year === selectedSeason;
        const href = `/players/${playerId}?season=${year}`;
        const className = `shrink-0 rounded-full border px-3 py-1.5 text-body-sm font-medium tabular-nums transition-colors ${
          isActive
            ? "border-accent-gold/30 bg-accent-gold-light text-accent-gold"
            : "border-border bg-surface text-text-tertiary hover:text-text-primary"
        }`;
        // Inside the modal a soft nav keeps the dialog open (the intercepted
        // route re-renders with the new season). On the canonical full page a
        // soft nav to the same path would be INTERCEPTED and pop the modal
        // over the page — a hard navigation stays on the canonical route.
        return variant === "modal" ? (
          <Link
            key={year}
            href={href}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {year}
          </Link>
        ) : (
          <a
            key={year}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {year}
          </a>
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
  variant,
}: WeeklyLinesTableProps) {
  const statColumns = position ? (STAT_COLUMNS_BY_POSITION[position] ?? []) : [];
  const statsByWeek = new Map(weeklyStats.map((s) => [s.week, s]));

  const headers = [
    "Week",
    "Owner",
    "Opp",
    "Slot",
    "Status",
    "Proj",
    "Actual",
    "Δ",
    ...(weeklyStats.length > 0 ? statColumns.map((c) => c.label) : []),
  ];

  // Union of lineup weeks and NFL-stat weeks: a season nobody in the league
  // rostered the player still shows his real stat lines, with the league
  // columns (owner/opponent/slot/status/points) blanked.
  const pointsByWeek = new Map(weeklyPoints.map((w) => [w.week, w]));
  const allWeeks = [
    ...new Set([...pointsByWeek.keys(), ...statsByWeek.keys()]),
  ].sort((a, b) => a - b);

  const rows = allWeeks.map((week) => {
    const w = pointsByWeek.get(week) ?? null;
    // Unplayed weeks (projection-only rows) show no actual and no delta —
    // a 0.0 actual would otherwise read as a fake negative delta.
    const delta =
      w && w.played && w.projectedPoints != null
        ? w.points - w.projectedPoints
        : null;
    const stat = statsByWeek.get(week);

    const ownerCell = w?.ownerFranchiseName ? (
      <span className="inline-flex" title={w.ownerFranchiseName}>
        <FranchiseLogo
          slug={w.ownerFranchiseSlug ?? ""}
          name={w.ownerFranchiseName}
          avatarUrl={w.ownerAvatarUrl}
          size={24}
          decorative
        />
        <span className="sr-only">{w.ownerFranchiseName}</span>
      </span>
    ) : (
      <span className="text-text-tertiary">&ndash;</span>
    );

    const opponentCell = w?.opponentFranchiseName ? (
      <span className="inline-flex" title={w.opponentFranchiseName}>
        <FranchiseLogo
          slug={w.opponentFranchiseSlug ?? ""}
          name={w.opponentFranchiseName}
          avatarUrl={w.opponentAvatarUrl}
          size={24}
          decorative
        />
        <span className="sr-only">{w.opponentFranchiseName}</span>
      </span>
    ) : (
      <span className="text-text-tertiary">&ndash;</span>
    );

    const statusCell = !w ? (
      <span className="text-text-tertiary">&ndash;</span>
    ) : w.started ? (
      <span className="font-medium text-text-primary">START</span>
    ) : (
      <span className="text-text-tertiary">BENCH</span>
    );

    const row: (string | number | React.ReactNode)[] = [
      week,
      ownerCell,
      opponentCell,
      w?.slot ?? "–",
      statusCell,
      w?.projectedPoints != null ? w.projectedPoints.toFixed(1) : "–",
      w && w.played ? w.points.toFixed(1) : "–",
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
        variant={variant}
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
