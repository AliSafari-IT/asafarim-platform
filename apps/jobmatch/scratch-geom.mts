import { readFileSync } from "node:fs";
import { detectColumnBoundaries, type PositionedItem } from "./lib/extraction/pdfLayout.js";
const bytes = new Uint8Array(readFileSync(process.argv[2]));
const { getDocumentProxy } = await import("unpdf");
const pdf = await getDocumentProxy(bytes);
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const items: PositionedItem[] = [];
  for (const raw of (await page.getTextContent()).items as any[]) {
    if (typeof raw.str !== "string" || !raw.str.trim()) continue;
    items.push({ text: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width ?? 0, height: raw.height || Math.abs(raw.transform[3]) || 0 });
  }
  console.log(`--- page ${p} (${vp.width.toFixed(0)}x${vp.height.toFixed(0)}) items=${items.length}`);
  console.log("  boundaries:", detectColumnBoundaries(items, vp.width));
  // items with small x (potential label column)
  const left = items.filter(i => i.x < 120);
  console.log("  items with x<120:", left.length);
  for (const l of left.slice(0, 14)) console.log("    ", JSON.stringify({t:l.text.slice(0,40), x:+l.x.toFixed(0), r:+(l.x+l.width).toFixed(0), y:+l.y.toFixed(0)}));
}
