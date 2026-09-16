import styles from "./auth-checkpoint-scene.module.css";

export type AuthCheckpointState = "idle" | "checking" | "success" | "error";

/**
 * "verify" presents an existing pass to the booth (sign-in).
 * "enroll" has the booth issue a new pass to the driver (sign-up).
 */
export type AuthCheckpointVariant = "verify" | "enroll";

export interface AuthCheckpointSceneProps {
  state?: AuthCheckpointState;
  variant?: AuthCheckpointVariant;
  className?: string;
}

/**
 * Decorative authentication metaphor for the Hub sign-in screen.
 *
 * The ambient timeline is entirely CSS-driven. `state` adds a live signal
 * from the real sign-in flow without participating in authentication itself.
 * The tuning variables live at the top of the companion CSS module.
 */
export function AuthCheckpointScene({
  state = "idle",
  variant = "verify",
  className,
}: AuthCheckpointSceneProps) {
  return (
    <div
      className={`${styles.scene}${className ? ` ${className}` : ""}`}
      data-auth-state={state}
      data-variant={variant}
      aria-hidden="true"
    >
      <svg
        className={styles.svg}
        viewBox="0 0 1200 460"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="checkpoint-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--checkpoint-sky-top)" />
            <stop offset="1" stopColor="var(--checkpoint-sky-bottom)" />
          </linearGradient>
          <linearGradient id="checkpoint-road" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--checkpoint-road)" />
            <stop offset="1" stopColor="var(--checkpoint-road-edge)" />
          </linearGradient>
          <radialGradient id="checkpoint-glow">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".2" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter
            id="checkpoint-soft-glow"
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <pattern
            id="checkpoint-grid"
            width="48"
            height="48"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 48 0 L 0 0 0 48"
              fill="none"
              stroke="var(--checkpoint-grid)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        <rect width="1200" height="520" fill="url(#checkpoint-sky)" />
        <rect
          width="1200"
          height="520"
          fill="url(#checkpoint-grid)"
          opacity=".5"
        />
        <ellipse
          className={styles.horizonGlow}
          cx="610"
          cy="338"
          rx="310"
          ry="160"
          fill="url(#checkpoint-glow)"
        />

        <g className={styles.hillsFar}>
          <path d="M0 330 C125 246 230 272 345 330 S550 370 680 282 S935 228 1200 322 V520 H0Z" />
        </g>

        {/* City skyline on the horizon, right of the checkpoint. */}
        <g className={styles.cityRight}>
          <rect x="838" y="268" width="30" height="104" />
          <rect x="872" y="238" width="38" height="134" />
          <rect x="914" y="286" width="26" height="86" />
          <rect x="944" y="216" width="34" height="156" />
          <rect x="982" y="256" width="28" height="116" />
          <rect x="1014" y="196" width="24" height="176" />
          <rect x="1042" y="272" width="32" height="100" />
          <rect x="1078" y="244" width="26" height="128" />
          <rect x="1108" y="292" width="34" height="80" />
          <g className={styles.cityWindows}>
            <path d="M844 280h6m6 0h6m-18 14h6m6 0h6m-18 14h6m6 0h6m-18 14h6m6 0h6" />
            <path d="M879 250h6m6 0h6m-18 16h6m6 0h6m-18 16h6m6 0h6m-18 16h6m6 0h6m-18 16h6m6 0h6" />
            <path d="M950 228h6m6 0h6m-18 18h6m6 0h6m-18 18h6m6 0h6m-18 18h6m6 0h6m-18 18h6m6 0h6" />
            <path d="M1020 208h6m6 0h6m-18 20h6m6 0h6m-18 20h6m6 0h6m-18 20h6m6 0h6" />
          </g>
        </g>

        {/* Roadside trees, right of the checkpoint, in front of the skyline. */}
        <g className={styles.treesRight}>
          <g transform="translate(806 371)">
            <rect
              className={styles.treeTrunk}
              x="-2.5"
              y="-20"
              width="5"
              height="20"
            />
            <circle className={styles.treeCanopy} cx="0" cy="-30" r="16" />
          </g>
          <g transform="translate(958 371) scale(0.85)">
            <rect
              className={styles.treeTrunk}
              x="-2.5"
              y="-20"
              width="5"
              height="20"
            />
            <circle className={styles.treeCanopy} cx="0" cy="-30" r="16" />
          </g>
          <g transform="translate(1152 371) scale(1.1)">
            <rect
              className={styles.treeTrunk}
              x="-2.5"
              y="-20"
              width="5"
              height="20"
            />
            <circle className={styles.treeCanopy} cx="0" cy="-30" r="16" />
          </g>
        </g>

        <g className={styles.hillsNear}>
          <path d="M0 372 H1200 V520 H0Z" />
        </g>

        <path className={styles.roadShadow} d="M-30 379 H1230" />
        <path className={styles.road} d="M-30 371 H1230" />
        <path className={styles.laneMarks} d="M-30 371 H1230" />

        <g className={styles.checkpoint}>
          <ellipse
            className={styles.checkpointAura}
            cx="615"
            cy="330"
            rx="112"
            ry="64"
          />
          <path className={styles.postShadow} d="M655 230v151" />
          <rect
            className={styles.post}
            x="642"
            y="224"
            width="26"
            height="158"
            rx="7"
          />
          <rect
            className={styles.postPanel}
            x="648"
            y="238"
            width="14"
            height="34"
            rx="4"
          />
          <circle className={styles.statusIdle} cx="655" cy="247" r="3.5" />
          <circle className={styles.statusSuccess} cx="655" cy="261" r="3.5" />

          <g className={styles.scanner}>
            <rect x="568" y="293" width="46" height="54" rx="8" />
            <path d="M578 307h26M578 314h18" />
            <rect
              className={styles.scanWindow}
              x="575"
              y="322"
              width="32"
              height="15"
              rx="4"
            />
            <path className={styles.scanLine} d="M580 326h22" />
          </g>

          <g className={styles.barrier}>
            <rect
              className={styles.barrierArm}
              x="655"
              y="282"
              width="122"
              height="11"
              rx="5.5"
            />
            <path
              className={styles.barrierStripe}
              d="M674 282v11m24-11v11m24-11v11m24-11v11"
            />
          </g>

          <g className={styles.successMark}>
            <circle cx="614" cy="268" r="22" />
            <path d="m603 268 7 7 14-16" />
          </g>
          <g className={styles.errorMark}>
            <circle cx="614" cy="268" r="22" />
            <path d="m606 260 16 16m0-16-16 16" />
          </g>
        </g>

        <g className={styles.car}>
          {/* Compact hatchback silhouette — Focus-style single greenhouse,
              short overhangs, sky-blue paint (see .carBody). */}
          <ellipse className={styles.carShadow} cx="0" cy="20" rx="39" ry="8" />
          <path
            className={styles.carBody}
            d="M-41 7 v-3 q0-5 5-6 l13-2 6-13 q2-4 6-4 h24 q4 0 6 4 l6 12 9 2 q7 1 7 8 v2 h4 q3 0 3 3 v3 h-89 Z"
          />
          <path
            className={styles.carGreenhouse}
            d="M-19 -8 -14 -18 q1-2 3-2 h22 q2 0 3 2 l5 10 z"
          />
          <path className={styles.carPillar} d="M0 -9 v-11" />
          <path className={styles.carTrim} d="M-33 8h74" />
          <path className={styles.carDoor} d="M-3 8v-16" />
          <circle className={styles.wheelArch} cx="-24" cy="20" r="11" />
          <circle className={styles.wheelArch} cx="26" cy="20" r="11" />
          <circle className={styles.wheel} cx="-24" cy="20" r="9" />
          <circle className={styles.wheelHub} cx="-24" cy="20" r="3.5" />
          <circle className={styles.wheel} cx="26" cy="20" r="9" />
          <circle className={styles.wheelHub} cx="26" cy="20" r="3.5" />
          <circle className={styles.headlight} cx="40" cy="8" r="3" />
          <rect
            className={styles.taillight}
            x="-44"
            y="3"
            width="3"
            height="6"
            rx="1.2"
          />
        </g>

        <g className={styles.credential}>
          <rect x="531" y="300" width="28" height="20" rx="4" />
          <circle cx="538" cy="307" r="2.5" />
          {variant === "enroll" ? (
            <path className={styles.credentialNew} d="M544 308.5h10m-5-5v10" />
          ) : (
            <path d="M544 306h9m-9 5h7" />
          )}
        </g>
      </svg>
    </div>
  );
}
