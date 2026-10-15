import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Social preview card shown when the link is shared (WhatsApp, X, LinkedIn)
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
          padding: "80px",
          background: "linear-gradient(135deg, #0B0F14 0%, #0F3D3A 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, color: "#2DD4BF", letterSpacing: 4, textTransform: "uppercase" }}>
          Learn by doing
        </div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800, marginTop: 24 }}>{SITE_NAME}</div>
        <div style={{ display: "flex", fontSize: 38, color: "#CBD5E1", marginTop: 24, maxWidth: 900 }}>
          {SITE_TAGLINE}
        </div>
      </div>
    ),
    { ...size },
  );
}
