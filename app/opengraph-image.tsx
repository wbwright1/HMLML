import { ImageResponse } from "next/og";

export const alt = "HMLML — Harambe Memorial League Memorial League";
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
          alignItems: "flex-start",
          justifyContent: "center",
          backgroundColor: "#1A1613",
          backgroundImage:
            "radial-gradient(circle at 8% 0%, rgba(226,184,88,0.09), rgba(26,22,19,0) 55%)",
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
            marginBottom: 28,
          }}
        >
          HARAMBE MEMORIAL LEAGUE MEMORIAL LEAGUE
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 208,
            lineHeight: 1,
            fontStyle: "italic",
            color: "#F2EADC",
          }}
        >
          HMLML
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
          The receipts are permanent.
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
    }
  );
}
