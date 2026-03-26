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
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-accent-green"
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
