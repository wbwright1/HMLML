"use client";

import { useRouter } from "next/navigation";
import { FranchiseLogo } from "@/components/franchise-logo";

interface FranchiseOption {
  id: string;
  slug: string;
  name: string;
  abbreviation?: string;
  brandingColor?: string;
}

interface FranchiseSelectorProps {
  franchises: FranchiseOption[];
  selectedSlugA?: string;
  selectedSlugB?: string;
}

export function FranchisePairSelector({
  franchises,
  selectedSlugA,
  selectedSlugB,
}: FranchiseSelectorProps) {
  const router = useRouter();

  function handleChange(side: "a" | "b", slug: string) {
    const params = new URLSearchParams();
    if (side === "a") {
      if (slug) params.set("a", slug);
      if (selectedSlugB) params.set("b", selectedSlugB);
    } else {
      if (selectedSlugA) params.set("a", selectedSlugA);
      if (slug) params.set("b", slug);
    }

    const qs = params.toString();
    router.push(`/records/head-to-head${qs ? `?${qs}` : ""}`);
  }

  const selectedA = franchises.find((f) => f.slug === selectedSlugA);
  const selectedB = franchises.find((f) => f.slug === selectedSlugB);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4">
      <div className="flex-1">
        <label
          htmlFor="franchise-a"
          className="block text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1.5"
        >
          Team A
        </label>
        <div className="flex items-center gap-3">
          {selectedA && (
            <FranchiseLogo
              slug={selectedA.slug}
              name={selectedA.name}
              abbreviation={selectedA.abbreviation}
              brandingColor={selectedA.brandingColor}
              size="sm"
            />
          )}
          <div style={{ position: "relative", display: "inline-block", flex: 1 }}>
            <select
              id="franchise-a"
              value={selectedSlugA ?? ""}
              onChange={(e) => handleChange("a", e.target.value)}
              style={{
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
                width: "100%",
                borderRadius: "0.5rem",
                backgroundColor: "#E8E4E0",
                paddingLeft: "1rem",
                paddingRight: "2.5rem",
                paddingTop: "0.625rem",
                paddingBottom: "0.625rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#1A1A1A",
                border: "none",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="">Select a team</option>
              {franchises.map((f) => (
                <option
                  key={f.id}
                  value={f.slug}
                  disabled={f.slug === selectedSlugB}
                >
                  {f.name}
                </option>
              ))}
            </select>
            <svg
              style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", width: "1rem", height: "1rem", color: "#6B6560", pointerEvents: "none" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      <span className="hidden sm:flex items-center text-muted-foreground font-bold text-lg pb-2">
        vs
      </span>
      <span className="sm:hidden text-center text-muted-foreground font-bold text-lg">
        vs
      </span>

      <div className="flex-1">
        <label
          htmlFor="franchise-b"
          className="block text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1.5"
        >
          Team B
        </label>
        <div className="flex items-center gap-3">
          {selectedB && (
            <FranchiseLogo
              slug={selectedB.slug}
              name={selectedB.name}
              abbreviation={selectedB.abbreviation}
              brandingColor={selectedB.brandingColor}
              size="sm"
            />
          )}
          <div style={{ position: "relative", display: "inline-block", flex: 1 }}>
            <select
              id="franchise-b"
              value={selectedSlugB ?? ""}
              onChange={(e) => handleChange("b", e.target.value)}
              style={{
                WebkitAppearance: "none",
                MozAppearance: "none",
                appearance: "none",
                width: "100%",
                borderRadius: "0.5rem",
                backgroundColor: "#E8E4E0",
                paddingLeft: "1rem",
                paddingRight: "2.5rem",
                paddingTop: "0.625rem",
                paddingBottom: "0.625rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#1A1A1A",
                border: "none",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="">Select a team</option>
              {franchises.map((f) => (
                <option
                  key={f.id}
                  value={f.slug}
                  disabled={f.slug === selectedSlugA}
                >
                  {f.name}
                </option>
              ))}
            </select>
            <svg
              style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", width: "1rem", height: "1rem", color: "#6B6560", pointerEvents: "none" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
