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
          <pattern
            id="checkpoint-hazard"
            width="14"
            height="14"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width="14" height="14" fill="var(--checkpoint-hazard-a)" />
            <rect width="7" height="14" fill="var(--checkpoint-hazard-b)" />
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

        {/* Drifting clouds. */}
        <g className={styles.clouds}>
          <g transform="translate(160 78)">
            <ellipse cx="0" cy="0" rx="30" ry="14" />
            <ellipse cx="24" cy="-6" rx="22" ry="12" />
            <ellipse cx="-26" cy="4" rx="20" ry="10" />
          </g>
          <g transform="translate(560 56)">
            <ellipse cx="0" cy="0" rx="36" ry="16" />
            <ellipse cx="30" cy="-6" rx="24" ry="13" />
            <ellipse cx="-30" cy="5" rx="22" ry="11" />
          </g>
          <g transform="translate(1010 92)">
            <ellipse cx="0" cy="0" rx="26" ry="12" />
            <ellipse cx="20" cy="-5" rx="18" ry="10" />
          </g>
        </g>

        {/* Jagged mountain range, two depths for parallax. */}
        <g className={styles.mountainsFar}>
          <path d="M0 372 60 240 150 300 230 190 320 280 420 220 520 300 610 210 700 290 800 230 900 310 1000 200 1100 280 1200 240 1200 372Z" />
        </g>
        <g className={styles.mountainsNear}>
          <path d="M0 372 80 300 170 340 260 280 360 345 460 300 560 350 660 310 760 355 860 315 960 350 1060 300 1150 340 1200 320 1200 372Z" />
        </g>

        <g className={styles.groundGrass}>
          <path d="M0 372 H1200 V520 H0Z" />
        </g>

        {/* Stone viaduct the road rides over, arches punched through the deck. */}
        <g className={styles.viaduct}>
          <rect x="380" y="372" width="460" height="56" rx="4" />
          <rect
            className={styles.viaductArch}
            x="410"
            y="372"
            width="66"
            height="46"
            rx="23"
          />
          <rect
            className={styles.viaductArch}
            x="570"
            y="372"
            width="66"
            height="46"
            rx="23"
          />
          <rect
            className={styles.viaductArch}
            x="730"
            y="372"
            width="66"
            height="46"
            rx="23"
          />
        </g>

        {/* Pine treeline, both sides of the checkpoint. */}
        <g className={styles.pines}>
          <g transform="translate(96 371) scale(1.05)">
            <rect
              className={styles.pineTrunk}
              x="-3"
              y="-14"
              width="6"
              height="14"
            />
            <path className={styles.pineTier} d="M-15 -14 15 -14 0 -29Z" />
            <path className={styles.pineTier} d="M-12 -24 12 -24 0 -39Z" />
            <path className={styles.pineTier} d="M-9 -34 9 -34 0 -47Z" />
          </g>
          <g transform="translate(236 371) scale(0.8)">
            <rect
              className={styles.pineTrunk}
              x="-3"
              y="-14"
              width="6"
              height="14"
            />
            <path className={styles.pineTier} d="M-15 -14 15 -14 0 -29Z" />
            <path className={styles.pineTier} d="M-12 -24 12 -24 0 -39Z" />
            <path className={styles.pineTier} d="M-9 -34 9 -34 0 -47Z" />
          </g>
          <g transform="translate(878 371) scale(0.9)">
            <rect
              className={styles.pineTrunk}
              x="-3"
              y="-14"
              width="6"
              height="14"
            />
            <path className={styles.pineTier} d="M-15 -14 15 -14 0 -29Z" />
            <path className={styles.pineTier} d="M-12 -24 12 -24 0 -39Z" />
            <path className={styles.pineTier} d="M-9 -34 9 -34 0 -47Z" />
          </g>
          <g transform="translate(1000 371) scale(1.15)">
            <rect
              className={styles.pineTrunk}
              x="-3"
              y="-14"
              width="6"
              height="14"
            />
            <path className={styles.pineTier} d="M-15 -14 15 -14 0 -29Z" />
            <path className={styles.pineTier} d="M-12 -24 12 -24 0 -39Z" />
            <path className={styles.pineTier} d="M-9 -34 9 -34 0 -47Z" />
          </g>
          <g transform="translate(1140 371) scale(0.85)">
            <rect
              className={styles.pineTrunk}
              x="-3"
              y="-14"
              width="6"
              height="14"
            />
            <path className={styles.pineTier} d="M-15 -14 15 -14 0 -29Z" />
            <path className={styles.pineTier} d="M-12 -24 12 -24 0 -39Z" />
            <path className={styles.pineTier} d="M-9 -34 9 -34 0 -47Z" />
          </g>
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

          {/* Guardhouse: roof, flag, lit window, ground shadow. */}
          <ellipse
            className={styles.cabinShadow}
            cx="649"
            cy="384"
            rx="56"
            ry="8"
          />
          <rect
            className={styles.cabinBody}
            x="614"
            y="246"
            width="70"
            height="136"
            rx="6"
          />
          <path className={styles.cabinRoof} d="M604 246 649 196 694 246Z" />
          <path className={styles.flagPole} d="M649 196V160" />
          <g className={styles.flag}>
            <path d="M649 160 649 178 671 169Z" />
          </g>
          <rect
            className={styles.cabinDoor}
            x="650"
            y="332"
            width="20"
            height="50"
            rx="2"
          />
          <rect
            className={styles.cabinWindow}
            x="626"
            y="266"
            width="20"
            height="28"
            rx="3"
          />
          <circle className={styles.statusIdle} cx="636" cy="276" r="3.5" />
          <circle className={styles.statusSuccess} cx="636" cy="290" r="3.5" />

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
