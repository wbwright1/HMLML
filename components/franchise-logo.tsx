import Image from "next/image";

interface FranchiseLogoProps {
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
  size?: "sm" | "md" | "lg" | "xl";
  decorative?: boolean;
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
}: FranchiseLogoProps) {
  const px = sizeMap[size];
  const altText = decorative ? "" : name;
  const logoSrc = `/logos/${slug}.png`;
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
          className={`font-bold select-none ${textSizeMap[size]}`}
          style={{ color: "#1A1613" }}
        >
          {getInitials(name, abbreviation)}
        </span>
      </div>
      {/* Image overlays fallback; if it fails to load the fallback shows through */}
      <Image
        src={logoSrc}
        alt={altText}
        width={px}
        height={px}
        className="relative z-10 object-cover"
        style={{ borderRadius: radius }}
      />
    </div>
  );
}
