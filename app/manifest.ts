import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HMLML — Harambe Memorial League Memorial League",
    short_name: "HMLML",
    description:
      "The official home of the Harambe Memorial League Memorial League: dynasty fantasy football history, records, and live scores.",
    start_url: "/",
    display: "standalone",
    background_color: "#1A1613",
    theme_color: "#1A1613",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
