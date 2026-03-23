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

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg"
      style={{ width: px, height: px }}
    >
      {/* Fallback — always rendered behind the image */}
      <div
        className="absolute inset-0 flex items-center justify-center rounded-lg"
        style={{ backgroundColor: brandingColor ?? "#6B6560" }}
        aria-hidden="true"
      >
        <span className={`font-bold text-white select-none ${textSizeMap[size]}`}>
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
      />
    </div>
  );
}
