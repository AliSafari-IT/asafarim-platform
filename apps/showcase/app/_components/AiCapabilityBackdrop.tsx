import styles from "./home.module.css";

/**
 * Decorative capability map for the exhibition hero. The signal enters as a
 * single AI capability, passes through the platform core, then fans out into
 * application-shaped modules. It deliberately contains no readable labels:
 * the page copy carries the meaning and remains the sole accessible content.
 */
export function AiCapabilityBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <svg
        className={styles.constellation}
        viewBox="0 0 760 520"
        fill="none"
        focusable="false"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="capability-signal" x1="78" y1="260" x2="704" y2="260">
            <stop offset="0" stopColor="var(--accent-2)" />
            <stop offset="0.52" stopColor="var(--accent)" />
            <stop offset="1" stopColor="var(--accent-2)" />
          </linearGradient>
          <radialGradient id="capability-field" cx="0" cy="0" r="1" gradientTransform="translate(376 260) rotate(90) scale(220)">
            <stop stopColor="var(--accent)" stopOpacity="0.13" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="376" cy="260" r="220" fill="url(#capability-field)" />

        <g className={styles.mesh}>
          <path d="M96 106H646" />
          <path d="M54 183H706" />
          <path d="M38 260H722" />
          <path d="M54 337H706" />
          <path d="M96 414H646" />
          <path d="M146 64V456" />
          <path d="M260 38V482" />
          <path d="M376 24V496" />
          <path d="M492 38V482" />
          <path d="M606 64V456" />
        </g>

        <g className={styles.orbits}>
          <ellipse cx="376" cy="260" rx="266" ry="150" />
          <ellipse cx="376" cy="260" rx="150" ry="266" transform="rotate(58 376 260)" />
        </g>

        <g className={styles.peripheral}>
          <path className={styles.branch} d="M418 238C474 206 486 126 548 108" />
          <path className={styles.branch} d="M422 254C510 248 548 198 622 194" />
          <path className={styles.branch} d="M422 266C510 272 548 322 622 326" />
          <path className={styles.branch} d="M418 282C474 314 486 394 548 412" />

          <g className={styles.appNode} transform="translate(548 72)">
            <rect width="120" height="72" rx="12" />
            <path d="M18 22H54M18 34H76M18 50H42" />
            <circle cx="96" cy="22" r="5" />
          </g>
          <g className={styles.appNode} transform="translate(622 158)">
            <rect width="108" height="72" rx="12" />
            <path d="M18 22H72M18 35H52M18 50H82" />
            <circle cx="86" cy="22" r="5" />
          </g>
          <g className={styles.appNode} transform="translate(622 290)">
            <rect width="108" height="72" rx="12" />
            <path d="M18 22H60M18 35H82M18 50H48" />
            <circle cx="86" cy="50" r="5" />
          </g>
          <g className={styles.appNode} transform="translate(548 376)">
            <rect width="120" height="72" rx="12" />
            <path d="M18 22H48M18 35H78M18 50H62" />
            <circle cx="96" cy="50" r="5" />
          </g>
        </g>

        <path className={styles.inputRail} d="M38 260H330" />
        <path className={`${styles.signal} ${styles.signalIn}`} d="M38 260H330" />
        <path className={`${styles.signal} ${styles.signalOut}`} d="M422 260C520 260 582 108 668 108" />
        <path className={`${styles.signal} ${styles.signalOutAlt}`} d="M422 260C520 260 582 412 668 412" />

        <g className={styles.inputNodes}>
          <rect x="62" y="244" width="32" height="32" rx="8" />
          <circle cx="136" cy="260" r="9" />
          <path d="M181 247L196 260L181 273" />
          <rect x="228" y="251" width="52" height="18" rx="9" />
        </g>

        <g className={styles.core}>
          <path d="M376 202L426 231V289L376 318L326 289V231L376 202Z" />
          <path className={styles.coreSlash} d="M385 224H403L367 296H349L385 224Z" />
          <path className={styles.coreCircuit} d="M379 253H397L403 243L414 262H426" />
          <path className={styles.coreCircuit} d="M374 272H396L404 266L414 279H426" />
        </g>

        <g className={styles.gates}>
          <circle cx="316" cy="260" r="5" />
          <circle cx="436" cy="260" r="5" />
          <circle cx="548" cy="108" r="5" />
          <circle cx="622" cy="194" r="5" />
          <circle cx="622" cy="326" r="5" />
          <circle cx="548" cy="412" r="5" />
        </g>
      </svg>
    </div>
  );
}
