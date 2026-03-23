"use client";

import { useRouter } from "next/navigation";
import { SeasonSelector } from "@/components/season-selector";

interface SeasonNavigatorProps {
  seasons: number[];
}

export function SeasonNavigator({ seasons }: SeasonNavigatorProps) {
  const router = useRouter();

  return (
    <SeasonSelector
      seasons={seasons}
      activeSeason={seasons[0]}
      showAllTime={false}
      onSelect={(year) => {
        if (typeof year === "number") {
          router.push(`/seasons/${year}`);
        }
      }}
    />
  );
}
