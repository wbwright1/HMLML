import Link from "next/link";

interface WeeklySuperlativeCardProps {
  type: "closest-win" | "biggest-blowout" | "highest-scorer" | "lowest-scorer";
  label: string;
  stat: string;
  context: string;
  teams?: {
    winner: string;
    loser: string;
    winnerScore: number;
    loserScore: number;
  };
  week: number;
  seasonYear: number;
}

const POSITIVE_TYPES = new Set(["closest-win", "highest-scorer"]);

export function WeeklySuperlativeCard({
  type,
  label,
  stat,
  context,
  teams,
  week,
  seasonYear,
}: WeeklySuperlativeCardProps) {
  const isPositive = POSITIVE_TYPES.has(type);

  const bgClass = isPositive ? "bg-accent-gold-light" : "bg-accent-warm-light";
  const accentClass = isPositive ? "text-accent-gold" : "text-accent-warm";

  return (
    <Link
      href={`/seasons/${seasonYear}/week/${week}`}
      className={`block rounded-xl border border-border p-6 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${bgClass}`}
    >
      <p className={`text-kicker mb-2 ${accentClass}`}>
        {label}
      </p>

      <p className="text-stat text-3xl text-text-primary mb-1">{stat}</p>

      <p className="text-body-sm text-text-secondary">{context}</p>

      {teams && (
        <div className="mt-3 pt-3 border-t border-border/50 text-body-sm text-text-tertiary tabular-nums">
          <span className="font-semibold text-text-secondary">{teams.winner}</span>
          {" "}{teams.winnerScore.toFixed(1)}
          {" "}def.{" "}
          {teams.loser} {teams.loserScore.toFixed(1)}
        </div>
      )}
    </Link>
  );
}
