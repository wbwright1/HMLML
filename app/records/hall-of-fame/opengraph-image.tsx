import { ImageResponse } from "next/og";

export const alt = "HMLML: The Hall of Fame & Shame";
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

// Static branding image, no DB read: the ladder and player wing both change
// week to week, so this stays a generic Hall card rather than chasing #1.
export default async function Image() {
  const serifItalic = await loadSerifItalic();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          backgroundColor: "#1A1613",
          backgroundImage:
            "radial-gradient(circle at 8% 0%, rgba(226,184,88,0.10), rgba(26,22,19,0) 55%), radial-gradient(circle at 95% 8%, rgba(120,150,110,0.06), rgba(26,22,19,0) 45%)",
          padding: "96px",
          fontFamily: serifItalic ? "Instrument Serif" : "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#E2B858",
            fontFamily: "sans-serif",
            marginBottom: 28,
          }}
        >
          HMLML · All-Time
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 108,
            lineHeight: 1.05,
            fontStyle: "italic",
            color: "#F2EADC",
            maxWidth: 1000,
          }}
        >
          The Hall of Fame &amp; Shame
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            marginTop: 32,
            color: "#98917F",
            fontFamily: "sans-serif",
          }}
        >
          Every franchise ranked. Every legend on the record. The receipts are permanent.
        </div>
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
