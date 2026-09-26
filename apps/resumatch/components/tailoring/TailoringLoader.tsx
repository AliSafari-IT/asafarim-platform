"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

/**
 * The tailoring wait (issue: "up to a minute" of silence between pasting a
 * job and seeing the review screen) had nothing but a single static
 * sentence to look at. Two provider calls (CV tailoring + an optional
 * cover letter, see app/api/tailor/generate-preview/route.ts) genuinely do
 * run for that long — there is no faster real state to show instead — so
 * this fills the wait with motion and a sequence of plausible, honest step
 * labels instead, the same "give the impression progress is happening"
 * treatment a lot of long-running AI UIs use. Nothing here is fake
 * telemetry: the steps describe what the pipeline actually does, in order,
 * they just aren't wired to real progress events (there aren't any to wire
 * to — it's one request/response, not a stream).
 */

const STEPS = [
  "resumatch.loader.step1",
  "resumatch.loader.step2",
  "resumatch.loader.step3",
  "resumatch.loader.step4",
  "resumatch.loader.step5",
  "resumatch.loader.step6",
];

const STEP_INTERVAL_MS = 3200;

export function TailoringLoader() {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % STEPS.length);
    }, STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="rm-tailor-loader" role="status" aria-live="polite">
      <svg
        className="rm-tailor-loader__svg"
        viewBox="0 0 200 150"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* the page */}
        <rect x="30" y="14" width="110" height="130" rx="8" className="rm-tailor-loader__page" />
        {/* a scan sweep crossing the page on a loop */}
        <clipPath id="rm-loader-page-clip">
          <rect x="30" y="14" width="110" height="130" rx="8" />
        </clipPath>
        <rect
          x="30"
          y="-40"
          width="110"
          height="40"
          className="rm-tailor-loader__sweep"
          clipPath="url(#rm-loader-page-clip)"
        />
        {/* text lines, each "typed" in on its own stagger */}
        <rect x="44" y="32" width="46" height="7" rx="3.5" className="rm-tailor-loader__line rm-tailor-loader__line--head" />
        <rect x="44" y="52" width="82" height="5" rx="2.5" className="rm-tailor-loader__line" style={{ animationDelay: "0.15s" }} />
        <rect x="44" y="63" width="68" height="5" rx="2.5" className="rm-tailor-loader__line" style={{ animationDelay: "0.35s" }} />
        <rect x="44" y="74" width="74" height="5" rx="2.5" className="rm-tailor-loader__line" style={{ animationDelay: "0.55s" }} />
        <rect x="44" y="92" width="40" height="5" rx="2.5" className="rm-tailor-loader__line" style={{ animationDelay: "0.85s" }} />
        <rect x="44" y="103" width="58" height="5" rx="2.5" className="rm-tailor-loader__line" style={{ animationDelay: "1.05s" }} />
        <rect x="44" y="114" width="50" height="5" rx="2.5" className="rm-tailor-loader__line" style={{ animationDelay: "1.25s" }} />
        {/* the "AI spark" orbiting the page corner */}
        <g className="rm-tailor-loader__spark-orbit">
          <path
            className="rm-tailor-loader__spark"
            d="M158 24 l3.2 8.2 8.2 3.2 -8.2 3.2 -3.2 8.2 -3.2 -8.2 -8.2 -3.2 8.2 -3.2 Z"
          />
        </g>
        <circle className="rm-tailor-loader__spark-dot" cx="150" cy="60" r="2.4" />
        <circle className="rm-tailor-loader__spark-dot" cx="156" cy="110" r="1.8" style={{ animationDelay: "0.6s" }} />
      </svg>

      <p className="rm-tailor-loader__step">{t(STEPS[stepIndex])}</p>
      <p className="rm-tailor-loader__hint">{t("resumatch.loader.hint")}</p>
    </div>
  );
}
