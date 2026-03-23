"use client";

import { useRouter } from "next/navigation";
import { SeasonSelector } from "@/components/season-selector";

interface SeasonDetailNavProps {
  seasons: number[];
  activeSeason: number;
}

export function SeasonDetailNav({
  seasons,
  activeSeason,
}: SeasonDetailNavProps) {
  const router = useRouter();

  return (
    <SeasonSelector
      seasons={seasons}
      activeSeason={activeSeason}
      showAllTime={false}
      onSelect={(year) => {
        if (typeof year === "number") {
          router.push(`/seasons/${year}`);
        }
      }}
    />
  );
}
