"use client";

import { useRouter } from "next/navigation";

interface FranchisePickerProps {
  franchises: { id: string; name: string; slug: string }[];
  selectedSlug?: string;
  /** Navigates to `${basePath}/${slug}/roster` on selection. */
  basePath?: string;
  label?: string;
}

/** "Switch team ▾" trigger: a native select styled as inline gold text so it
 * reads as a link, not a form control. Self-navigating client island — no
 * onChange prop, since the pages that render it are server components. */
export function FranchisePicker({
  franchises,
  selectedSlug,
  basePath = "/teams",
  label = "Switch team",
}: FranchisePickerProps) {
  const router = useRouter();

  return (
    <div className="relative inline-flex items-center gap-1">
      <select
        value={selectedSlug ?? ""}
        onChange={(e) => router.push(`${basePath}/${e.target.value}/roster`)}
        aria-label={label}
        className="cursor-pointer appearance-none rounded-md bg-transparent py-1 pl-1 pr-4 text-body-sm font-semibold text-accent-gold hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold"
      >
        <option value="" disabled hidden>
          {label}
        </option>
        {franchises.map((f) => (
          <option key={f.id} value={f.slug} className="bg-[#211C18] text-text-primary">
            {f.name}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 text-[10px] text-accent-gold"
      >
        &#9662;
      </span>
    </div>
  );
}
