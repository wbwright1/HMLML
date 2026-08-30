"use client";

// Root-layout errors unmount the whole app, including globals.css, so this
// file must render its own <html>/<body> and inline every style it needs
// (mirrors app/error.tsx's tone, but cannot rely on Tailwind or the theme
// tokens being loaded).
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1A1613",
          color: "#F2EADC",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "24px",
            textAlign: "center",
            padding: "24px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: 600, margin: 0 }}>
              Something went wrong
            </h1>
            <p style={{ color: "#B8B0A0", maxWidth: "420px", margin: 0 }}>
              The site hit a snag it couldn&rsquo;t recover from. This may be a
              sync issue. Try refreshing in a moment.
            </p>
            <p style={{ color: "#98917F", fontSize: "12px", marginTop: "8px" }}>
              We&rsquo;re showing the last available data.
            </p>
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={reset}
              style={{
                backgroundColor: "#E2B858",
                color: "#1A1613",
                border: "none",
                borderRadius: "999px",
                padding: "10px 24px",
                fontWeight: 600,
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error renders its own html/body outside the App Router tree, where next/link is not usable */}
            <a
              href="/"
              style={{
                border: "1px solid rgba(255,255,255,.14)",
                color: "#F2EADC",
                borderRadius: "999px",
                padding: "10px 24px",
                fontWeight: 600,
                fontSize: "15px",
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
