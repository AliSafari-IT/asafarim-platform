import { ImageResponse } from "next/og";
import { getRoutableTools, getTool } from "../../../lib/tools/catalogue";

export const alt = "An AI Workbench tool by ASafarIM Digital";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getRoutableTools().map((tool) => ({ slug: tool.slug }));
}

/** Social preview naming the tool's job, from the catalogue (#681). */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const tool = getTool((await params).slug);
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
        <div style={{ fontSize: 26, color: "#b45309", fontFamily: "monospace" }}>ASAFARIM · AI WORKBENCH</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 60, fontWeight: 700, color: "#211d18", lineHeight: 1.15 }}>{tool?.title ?? "AI Workbench"}</div>
          <div style={{ fontSize: 28, color: "#6e6557", marginTop: 20, lineHeight: 1.35 }}>{tool?.shortDescription ?? ""}</div>
        </div>
        <div style={{ fontSize: 24, color: "#6e6557", fontFamily: "monospace" }}>asafarim.com/tools · free · no sign-in</div>
      </div>
    ),
    size
  );
}
