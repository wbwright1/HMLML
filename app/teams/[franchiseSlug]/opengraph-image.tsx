import { ImageResponse } from "next/og";
import { getLeaderboard } from "@/lib/queries/records";

export const alt = "HMLML franchise: all-time record and rings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentserif/InstrumentSerif-Italic.ttf";

async function loadSerifItalic() {
  try {
    const res = await fetch(FONT_URL, { cache: "force-cache" });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

interface FranchiseOg {
  name: string;
  record: string;
  winPct: string;
  championships: number;
}

// Cheap: one all-time aggregate query for the whole league, then pick the slug.
// Falls back to null on any error or unknown slug so the image degrades to
// generic HMLML branding rather than throwing.
async function loadFranchise(slug: string): Promise<FranchiseOg | null> {
  try {
    const leaderboard = await getLeaderboard();
    const entry = leaderboard.find((e) => e.slug === slug);
    if (!entry) return null;
    const record =
      entry.ties > 0
        ? `${entry.wins}-${entry.losses}-${entry.ties}`
        : `${entry.wins}-${entry.losses}`;
    return {
      name: entry.name,
      record,
      winPct: `${(entry.winPct * 100).toFixed(1)}%`,
      championships: entry.championships,
    };
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ franchiseSlug: string }>;
}) {
  const { franchiseSlug } = await params;
  const [serifItalic, franchise] = await Promise.all([
    loadSerifItalic(),
    loadFranchise(franchiseSlug),
  ]);

  const serifFamily = serifItalic ? "Instrument Serif" : "serif";

  function Stat({ value, label }: { value: string; label: string }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", fontSize: 76, color: "#F2EADC" }}>
          {value}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 20,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#98917F",
            fontFamily: "sans-serif",
          }}
        >
          {label}
        </div>
      </div>
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#1A1613",
          backgroundImage:
            "radial-gradient(circle at 8% 0%, rgba(226,184,88,0.10), rgba(26,22,19,0) 55%), radial-gradient(circle at 95% 8%, rgba(120,150,110,0.06), rgba(26,22,19,0) 45%)",
          padding: "80px",
          fontFamily: serifFamily,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#E2B858",
              fontFamily: "sans-serif",
              marginBottom: 24,
            }}
          >
            {franchise ? "HMLML · Franchise" : "Harambe Memorial League Memorial League"}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: franchise ? 108 : 200,
              lineHeight: 1,
              fontStyle: "italic",
              color: "#F2EADC",
              maxWidth: 1040,
            }}
          >
            {franchise ? franchise.name : "HMLML"}
          </div>
        </div>

        {franchise ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 72 }}>
            <Stat value={franchise.record} label="All-Time" />
            <Stat value={franchise.winPct} label="Win Rate" />
            <Stat
              value={String(franchise.championships)}
              label={franchise.championships === 1 ? "Ring" : "Rings"}
            />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: "#98917F",
              fontFamily: "sans-serif",
            }}
          >
            The receipts are permanent.
          </div>
        )}
      </div>
    ),
    {
      ...size,
      fonts: serifItalic
        ? [
            {
              name: "Instrument Serif",
              data: serifItalic,
              style: "italic",
              weight: 400,
            },
          ]
        : undefined,
    },
  );
}
