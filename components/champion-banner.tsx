import Link from "next/link";

interface ChampionBannerProps {
  seasonYear: number;
  franchiseName: string;
  franchiseSlug: string;
  record?: string;
  defeatedOpponent?: string;
}

export function ChampionBanner({
  seasonYear,
  franchiseName,
  franchiseSlug,
  record,
  defeatedOpponent,
}: ChampionBannerProps) {
  return (
    <Link
      href={`/teams/${franchiseSlug}`}
      className="card-surface card-glows group block px-6 py-10 sm:px-10 sm:py-12 transition-colors hover:border-border-strong"
      style={{ background: "linear-gradient(140deg, rgba(226,184,88,0.14), rgba(226,184,88,0.03))" }}
    >
      {/* Trophy watermark */}
      <svg
        className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 h-32 w-32 sm:h-44 sm:w-44 text-accent-gold opacity-[0.14]"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M5 3h14c.55 0 1 .45 1 1v2c0 2.76-2.24 5-5 5h-.42c-.77 1.2-1.91 2.13-3.24 2.65L12 17h3v2H9v-2h3l.66-3.35C10.34 12.78 8.56 10.57 8.09 8H8c-2.76 0-5-2.24-5-5V4c0-.55.45-1 1-1zm1 2v1c0 1.65 1.35 3 3 3h.17A7.01 7.01 0 019 6.08V5H6zm12 0h-3v1.08c-.06.35-.15.69-.27 1.01.87-.43 1.58-1.16 1.98-2.09H18z" />
      </svg>

      <div className="relative z-10">
        <p className="text-kicker text-accent-gold mb-2">
          {seasonYear} Champion
        </p>
        <h2 className="text-h2 text-text-primary">{franchiseName}</h2>
        {(record || defeatedOpponent) && (
          <p className="text-body-sm text-text-tertiary mt-2">
            {record && <span className="tabular-nums">{record}</span>}
            {record && defeatedOpponent && <span> &middot; </span>}
            {defeatedOpponent && <span>Defeated {defeatedOpponent}</span>}
          </p>
        )}
      </div>
    </Link>
  );
}
