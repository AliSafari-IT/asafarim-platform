import { ImageResponse } from "next/og";

export const alt = "AI Workbench — narrow AI tools that show their sources, by ASafariM Digital";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
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
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ fontSize: 26, color: "#b45309", fontFamily: "monospace" }}>ASAFARIM DIGITAL</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 68, fontWeight: 700, color: "#211d18" }}>AI Workbench</div>
          <div style={{ fontSize: 30, color: "#6e6557", marginTop: 20 }}>Narrow AI tools that show where every item came from.</div>
        </div>
        <div style={{ fontSize: 24, color: "#6e6557", fontFamily: "monospace" }}>asafarim.com/tools</div>
      </div>
    ),
    size
  );
}
