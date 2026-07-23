interface FranchiseLogoProps {
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  size?: "sm" | "md" | "lg" | "xl" | number;
  decorative?: boolean;
  /**
   * Remote per-season team avatar (e.g. Sleeper CDN). When set it renders over
   * the monogram crest; if it fails to load the monogram shows through. Null or
   * omitted keeps the existing local-logo behavior.
   */
  avatarUrl?: string | null;
}

const sizeMap = {
  sm: 32,
  md: 48,
  lg: 64,
  xl: 96,
} as const;

const textSizeMap = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-xl",
} as const;

function getInitials(name: string, abbreviation?: string): string {
  if (abbreviation) return abbreviation.slice(0, 2).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// Dynasty crest shape: rounded square at ~28% of size, distinct from the
// circular crop used for player headshots (see player-headshot.tsx).
function crestRadius(px: number): string {
  return `${Math.round(px * 0.28)}px`;
}

export function FranchiseLogo({
  slug,
  name,
  abbreviation,
  brandingColor,
  size = "md",
  decorative = false,
  avatarUrl,
}: FranchiseLogoProps) {
  const px = typeof size === "number" ? size : sizeMap[size];
  const initialsClass =
    typeof size === "number"
      ? px < 28
        ? "text-[9px]"
        : "text-sm"
      : textSizeMap[size];
  const altText = decorative ? "" : name;
  const radius = crestRadius(px);

  return (
    <div
      className="relative shrink-0 overflow-hidden"
      style={{ width: px, height: px, borderRadius: radius }}
    >
      {/* Fallback — always rendered behind the image */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: brandingColor ?? "linear-gradient(140deg, #E2B858, #8E6E2A)",
          borderRadius: radius,
        }}
        aria-hidden="true"
      >
        <span
          className={`font-bold select-none ${initialsClass}`}
          style={{ color: "#1A1613" }}
        >
          {getInitials(name, abbreviation)}
        </span>
      </div>
      {/*
        Remote avatar overlays the monogram fallback; if it fails to load the
        monogram shows through. Avatars use a plain <img> (arbitrary CDN hosts
        aren't in the next/image allowlist) with no-referrer. With no avatarUrl
        we render the monogram alone (there are no bundled local crest images),
        avoiding a broken-image glyph.
      */}
      {avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={altText}
          width={px}
          height={px}
          referrerPolicy="no-referrer"
          className="relative z-10 object-cover"
          style={{ width: px, height: px, borderRadius: radius }}
        />
      )}
    </div>
  );
}
