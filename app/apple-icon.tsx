import { ImageResponse } from "next/og";

// Icona per la schermata Home di iPhone (serve PNG: la genera Next da questo disegno).
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
          position: "relative",
          background: "#8e3b46",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 512 512">
          <path d="M150 112h180c0 0 14 150-90 176c-104-26-90-176-90-176z" fill="#faf7f2" />
          <path d="M159 190h162c-6 44-27 84-81 98c-54-14-75-54-81-98z" fill="#c8892b" />
          <rect x="230" y="284" width="20" height="104" fill="#faf7f2" />
          <rect x="172" y="384" width="136" height="20" rx="10" fill="#faf7f2" />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 24,
            right: 16,
            display: "flex",
            color: "#faf7f2",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          EM
        </div>
      </div>
    ),
    size,
  );
}
