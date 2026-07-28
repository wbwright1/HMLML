import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Analytics } from "@vercel/analytics/next";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const siteDescription =
  "The official home of the Harambe Memorial League Memorial League: dynasty fantasy football history, records, and live scores.";

export const metadata: Metadata = {
  metadataBase: new URL("https://hmlml.app"),
  title: "Harambe Memorial League Memorial League",
  description: siteDescription,
  openGraph: {
    title: "HMLML",
    description: siteDescription,
    url: "https://hmlml.app",
    siteName: "HMLML",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "HMLML",
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#1A1613",
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "font-sans antialiased",
        geist.variable,
        instrumentSerif.variable,
        jetbrainsMono.variable
      )}
    >
      <body className="bg-background text-foreground min-h-screen">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Skip to content
        </a>

        <SiteNav />

        <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6 lg:px-8">
          <main id="main-content" className="pt-6 pb-8">
            {children}
          </main>
        </div>

        <SiteFooter />
        {modal}
        <Analytics />
      </body>
    </html>
  );
}
