import { ImageResponse } from "next/og";
import { site } from "../content/site";

export const runtime = "edge";
export const alt = "Ali Safari — Full-Stack & AI Application Engineer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          backgroundColor: "#f6f1e7",
          backgroundImage:
            "radial-gradient(60rem 30rem at 85% -10%, rgba(180,83,9,0.12), transparent 60%)",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              width: 56,
              height: 56,
              borderRadius: 10,
              backgroundColor: "#b45309",
              color: "#fdfaf3",
              fontFamily: "monospace",
              fontSize: 26,
              fontWeight: 700,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            A/
          </div>
          <div style={{ fontSize: 26, color: "#6e6557", fontFamily: "monospace" }}>
            ASAFARIM DIGITAL
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#211d18", lineHeight: 1.15 }}>
            {site.person.name}
          </div>
          <div style={{ fontSize: 34, color: "#b45309", marginTop: 16 }}>
            {site.person.jobTitle}
          </div>
        </div>
        <div style={{ fontSize: 24, color: "#6e6557", fontFamily: "monospace" }}>
          asafarim.com
        </div>
      </div>
    ),
    { ...size }
  );
}
