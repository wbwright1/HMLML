"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface SeasonPickerProps {
  seasons: number[];
  activeSeason: number;
  paramName?: string;
}

export function SeasonPicker({
  seasons,
  activeSeason,
  paramName = "season",
}: SeasonPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={activeSeason}
      onChange={handleChange}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-body-sm font-mono font-medium tabular-nums text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus:border-accent-gold"
      aria-label="Select season"
    >
      {seasons.map((year) => (
        <option key={year} value={year}>
          {year}
        </option>
      ))}
    </select>
  );
}
