import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 7,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
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
