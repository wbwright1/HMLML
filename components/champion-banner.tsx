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
      className="block w-full relative overflow-hidden rounded-lg"
    >
      <div className="relative bg-gradient-to-br from-accent-green to-[#1a3d28] px-6 py-10 sm:px-10 sm:py-14">
        {/* Trophy watermark */}
        <svg
          className="absolute right-4 top-1/2 -translate-y-1/2 h-32 w-32 sm:h-48 sm:w-48 opacity-[0.10]"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M5 3h14c.55 0 1 .45 1 1v2c0 2.76-2.24 5-5 5h-.42c-.77 1.2-1.91 2.13-3.24 2.65L12 17h3v2H9v-2h3l.66-3.35C10.34 12.78 8.56 10.57 8.09 8H8c-2.76 0-5-2.24-5-5V4c0-.55.45-1 1-1zm1 2v1c0 1.65 1.35 3 3 3h.17A7.01 7.01 0 019 6.08V5H6zm12 0h-3v1.08c-.06.35-.15.69-.27 1.01.87-.43 1.58-1.16 1.98-2.09H18z"
            className="text-white"
          />
        </svg>

        <div className="relative z-10">
          <p className="text-caption uppercase text-white/60 mb-2">
            {seasonYear} CHAMPION
          </p>
          <h2 className="text-h2 text-white">{franchiseName}</h2>
          {(record || defeatedOpponent) && (
            <p className="text-body-sm text-white/75 mt-2">
              {record && <span>{record}</span>}
              {record && defeatedOpponent && <span> &middot; </span>}
              {defeatedOpponent && (
                <span>Defeated {defeatedOpponent}</span>
              )}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
