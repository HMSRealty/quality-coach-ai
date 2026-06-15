import { ImageResponse } from "next/og";

// Tab favicon — Closer's Office mark. Jet background, upward checkmark
// stroke in money green. Next 15 auto-generates the favicon from this.
export const runtime = "edge";
export const size = { width: 64, height: 64 };
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
          background: "#0B0B0B",
          borderRadius: 14,
        }}
      >
        <svg width="48" height="32" viewBox="0 0 42 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 17 L13 25 L37 4" stroke="#16A34A" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
