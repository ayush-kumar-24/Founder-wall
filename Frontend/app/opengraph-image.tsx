import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Founder's Wall — Anonymous Founder Community by GoXL";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "84px",
          background: "linear-gradient(160deg, #ece0c4, #ded1af)",
          fontFamily: "sans-serif",
          color: "#2b241a",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 3,
            color: "#2f7d2c",
            fontWeight: 700,
          }}
        >
          AN INITIATIVE BY GOXL
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 110,
            fontWeight: 800,
            marginTop: 18,
            lineHeight: 1.02,
          }}
        >
          Founder&apos;s Wall
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 40,
            marginTop: 26,
            color: "#463d2d",
            maxWidth: 940,
            lineHeight: 1.35,
          }}
        >
          Your problems. Your questions. Zero judgment. An anonymous community
          for startup founders.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 44,
            fontSize: 30,
            color: "#6b6048",
          }}
        >
          founderwall.goxl.in
        </div>
      </div>
    ),
    { ...size }
  );
}
