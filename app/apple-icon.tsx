import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1A1613",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 108,
            fontStyle: "italic",
            fontFamily: "serif",
            color: "#E2B858",
          }}
        >
          H
        </div>
      </div>
    ),
    { ...size }
  );
}
