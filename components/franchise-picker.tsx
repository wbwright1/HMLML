"use client";

interface FranchisePickerProps {
  franchises: { id: string; name: string; slug: string }[];
  selectedSlug?: string;
  onChange: (slug: string) => void;
  label?: string;
}

export function FranchisePicker({
  franchises,
  selectedSlug,
  onChange,
  label = "Select franchise",
}: FranchisePickerProps) {
  return (
    <select
      value={selectedSlug ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent-green focus:border-accent-green"
      aria-label={label}
    >
      <option value="" disabled>
        {label}
      </option>
      {franchises.map((f) => (
        <option key={f.id} value={f.slug}>
          {f.name}
        </option>
      ))}
    </select>
  );
}
