/*
 * Fixture renderer — given a validated asset plan, deterministically produces
 * a structured render report and a pure-SVG storyboard strip. No image or
 * video encoding, no raster assets, no new dependencies: every "frame" is a
 * labelled rectangle standing in for a synthetic placeholder shot.
 */

const FPS = 24;
const SECONDS_PER_ASSET = 2.5;

/**
 * Deterministic per-asset duration/frame count and a total runtime. This is
 * the "observed" side of the cost/latency comparison — computed from the
 * asset plan actually produced, not estimated in advance (see engine/cost.mjs
 * for the "estimated" side).
 */
export function buildRenderReport(assetPlan) {
  const shots = assetPlan.assets.map((asset, i) => {
    const durationSeconds = SECONDS_PER_ASSET;
    return {
      shotIndex: asset.shotIndex ?? i,
      assetId: asset.assetId,
      kind: asset.kind,
      durationSeconds,
      frameCount: Math.round(durationSeconds * FPS),
    };
  });
  const totalDurationSeconds = Math.round(shots.reduce((s, sh) => s + sh.durationSeconds, 0) * 100) / 100;
  const totalFrameCount = shots.reduce((s, sh) => s + sh.frameCount, 0);
  return { fps: FPS, shots, totalDurationSeconds, totalFrameCount };
}

/**
 * A minimal, deterministic SVG storyboard strip: one labelled rect per shot.
 * Rendered directly by the Showcase demo — no client-side computation needed.
 */
export function buildStoryboardSvg(report) {
  const w = 140;
  const h = 90;
  const gap = 10;
  const totalWidth = report.shots.length * (w + gap) - gap;
  const rects = report.shots
    .map((shot, i) => {
      const x = i * (w + gap);
      const hue = (i * 47) % 360; // deterministic, evenly spread synthetic color
      return (
        `<g>` +
        `<rect x="${x}" y="0" width="${w}" height="${h}" rx="8" fill="hsl(${hue} 45% 22%)" stroke="hsl(${hue} 45% 45%)" />` +
        `<text x="${x + 10}" y="20" font-size="11" fill="#e6edf3" font-family="ui-monospace, monospace">Shot ${shot.shotIndex + 1}</text>` +
        `<text x="${x + 10}" y="38" font-size="10" fill="#8b98a5" font-family="ui-monospace, monospace">${shot.kind}</text>` +
        `<text x="${x + 10}" y="74" font-size="10" fill="#8b98a5" font-family="ui-monospace, monospace">${shot.durationSeconds}s · ${shot.frameCount}f</text>` +
        `</g>`
      );
    })
    .join("");
  return `<svg viewBox="0 0 ${totalWidth} ${h}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}
