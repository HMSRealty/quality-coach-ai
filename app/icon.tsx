import { ImageResponse } from "next/og";

// Tab favicon — Resona mark. Deep-pine tile with a four-bar equalizer
// (the call waveform) in teal / coral / amber. Next 15 auto-generates the
// favicon from this.
export const runtime = "edge";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  const bars = [
    { h: 16, c: "#0e7c6b" },
    { h: 34, c: "#ef5f3b" },
    { h: 24, c: "#e3a23a" },
    { h: 42, c: "#0e7c6b" },
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 5,
          background: "#15302e",
          borderRadius: 14,
          padding: 14,
        }}
      >
        {bars.map((b, i) => (
          <div key={i} style={{ width: 6, height: b.h, borderRadius: 3, background: b.c }} />
        ))}
      </div>
    ),
    { ...size },
  );
}
