import type { ReactNode } from "react";

interface StatHeroProps {
  value: ReactNode;
  label: string;
  badge?: string;
  context?: string;
  variant?: "xl" | "lg" | "md";
}

const valueSizeMap = {
  xl: "text-[80px] leading-none",
  lg: "text-[52px] leading-none",
  md: "text-[38px] leading-none",
} as const;

export function StatHero({
  value,
  label,
  badge,
  context,
  variant = "lg",
}: StatHeroProps) {
  return (
    <figure className="flex flex-col items-center text-center" role="group">
      {badge && (
        <span className="text-caption uppercase tracking-widest text-primary mb-2">
          {badge}
        </span>
      )}

      <p className={`font-black ${valueSizeMap[variant]}`}>{value}</p>

      <figcaption className="mt-1 space-y-0.5">
        <p className="text-body-sm font-medium text-muted-foreground">{label}</p>
        {context && (
          <p className="text-caption text-muted-foreground">{context}</p>
        )}
      </figcaption>
    </figure>
  );
}
