import styles from "./admin-sign-in.module.css";

export type AdminAuthState = "idle" | "checking" | "success" | "error";

export function AdminSignInScene({ state }: { state: AdminAuthState }) {
  const stateClass =
    state === "checking"
      ? styles.stateChecking
      : state === "success"
        ? styles.stateSuccess
        : state === "error"
          ? styles.stateError
          : "";

  return (
    <div className={`${styles.scene} ${stateClass}`} aria-hidden="true">
      <svg
        className={styles.sceneSvg}
        viewBox="0 0 900 560"
        preserveAspectRatio="xMidYMid slice"
        focusable="false"
      >
        <defs>
          <linearGradient id="adminSky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--surface-2)" stopOpacity=".85" />
            <stop offset="1" stopColor="var(--bg)" stopOpacity=".1" />
          </linearGradient>
          <radialGradient id="adminCore">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".38" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
          <filter id="adminGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <pattern
            id="adminGrid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M32 0H0V32"
              fill="none"
              stroke="var(--line)"
              strokeWidth="1"
              opacity=".5"
            />
          </pattern>
        </defs>
        <rect width="900" height="560" fill="url(#adminSky)" />
        <rect width="900" height="560" fill="url(#adminGrid)" />

        <g
          opacity=".55"
          fill="none"
          stroke="var(--line-strong)"
          strokeWidth="1"
        >
          <path d="M0 420 C155 330 194 210 346 284 S540 480 690 314 S820 200 900 232" />
          <path d="M0 458 C154 366 194 246 346 320 S540 516 690 350 S820 236 900 268" />
        </g>

        <g
          className={styles.orbit}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          opacity=".48"
        >
          <ellipse
            cx="360"
            cy="250"
            rx="214"
            ry="72"
            transform="rotate(-18 360 250)"
          />
          <ellipse
            cx="360"
            cy="250"
            rx="180"
            ry="124"
            transform="rotate(36 360 250)"
          />
          <ellipse
            cx="360"
            cy="250"
            rx="268"
            ry="166"
            transform="rotate(-52 360 250)"
          />
        </g>
        <g
          className={styles.orbitSlow}
          fill="none"
          stroke="var(--accent-2)"
          strokeWidth="1"
          strokeDasharray="4 12"
          opacity=".6"
        >
          <ellipse
            cx="360"
            cy="250"
            rx="235"
            ry="96"
            transform="rotate(26 360 250)"
          />
          <ellipse
            cx="360"
            cy="250"
            rx="296"
            ry="150"
            transform="rotate(-32 360 250)"
          />
        </g>

        <circle
          className={`${styles.pulse} ${styles.core}`}
          cx="360"
          cy="250"
          r="96"
          fill="url(#adminCore)"
          filter="url(#adminGlow)"
        />
        <circle
          cx="360"
          cy="250"
          r="27"
          fill="var(--surface)"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <path
          d="M348 250l9 9 18-21"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <g fill="var(--accent)" opacity=".9">
          <circle cx="146" cy="306" r="5" />
          <circle cx="218" cy="126" r="4" />
          <circle cx="546" cy="124" r="5" />
          <circle cx="642" cy="312" r="4" />
          <circle cx="472" cy="408" r="4" />
        </g>
        <path
          className={styles.packet}
          d="M-6 -6h12v12H-6z"
          fill="var(--accent-2)"
        />

        <g
          fill="var(--muted)"
          fontFamily="var(--font-mono)"
          fontSize="11"
          letterSpacing="2"
          opacity=".7"
        >
          <text x="72" y="88">
            AUTH / LATTICE 07
          </text>
          <text x="88" y="500">
            NODE SIGNAL // READY
          </text>
          <text x="560" y="70">
            ROLE GATE → VERIFIED ACCESS
          </text>
        </g>
      </svg>
    </div>
  );
}
