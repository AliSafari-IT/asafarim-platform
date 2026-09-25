/**
 * The landing hero's scene: a job posting feeding a tailored CV, with the
 * product's promises floating around it as badges. Pure inline SVG whose
 * fills come from `.lp-art__*` classes in resumatch.css, so it follows the
 * light/dark tokens instead of shipping one asset per theme. Decorative —
 * everything it shows is said in text elsewhere on the page.
 */
export function HeroIllustration() {
  return (
    <svg className="lp-art" viewBox="0 0 560 470" role="presentation" aria-hidden="true">
      <defs>
        <pattern id="lp-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.4" className="lp-art__dot" />
        </pattern>
        <linearGradient id="lp-flow" x1="0" x2="1">
          <stop offset="0" stopColor="var(--lp-warm)" />
          <stop offset="1" stopColor="var(--accent)" />
        </linearGradient>
      </defs>

      {/* Backdrop */}
      <rect x="40" y="40" width="500" height="400" rx="36" className="lp-art__panel" />
      <rect x="60" y="60" width="200" height="140" fill="url(#lp-dots)" />
      <circle cx="470" cy="410" r="70" className="lp-art__halo" />

      {/* Job posting card (back) */}
      <g className="lp-float lp-float--slow">
        <g transform="rotate(-5 150 200)">
          <rect x="62" y="110" width="190" height="220" rx="16" className="lp-art__card" />
          <rect x="62" y="110" width="190" height="34" rx="16" className="lp-art__card-head" />
          <rect x="62" y="130" width="190" height="14" className="lp-art__card-head" />
          <circle cx="80" cy="127" r="4" className="lp-art__warm" />
          <circle cx="93" cy="127" r="4" className="lp-art__muted-fill" />
          <circle cx="106" cy="127" r="4" className="lp-art__muted-fill" />
          <text x="78" y="170" className="lp-art__label">JOB POSTING</text>
          <rect x="78" y="180" width="140" height="9" rx="4.5" className="lp-art__ink-fill" />
          <rect x="78" y="198" width="110" height="7" rx="3.5" className="lp-art__line" />
          <rect x="78" y="212" width="150" height="7" rx="3.5" className="lp-art__line" />
          <rect x="78" y="226" width="125" height="7" rx="3.5" className="lp-art__line" />
          <rect x="78" y="248" width="56" height="20" rx="10" className="lp-art__chip" />
          <text x="106" y="262" textAnchor="middle" className="lp-art__chip-text">React</text>
          <rect x="140" y="248" width="80" height="20" rx="10" className="lp-art__chip" />
          <text x="180" y="262" textAnchor="middle" className="lp-art__chip-text">TypeScript</text>
          <rect x="78" y="274" width="94" height="20" rx="10" className="lp-art__chip" />
          <text x="125" y="288" textAnchor="middle" className="lp-art__chip-text">Accessibility</text>
          <rect x="78" y="306" width="120" height="7" rx="3.5" className="lp-art__line" />
        </g>
      </g>

      {/* Flow from posting to CV */}
      <path
        d="M236 220 C 270 180, 290 250, 318 212"
        fill="none"
        stroke="url(#lp-flow)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 8"
        className="lp-art__flow"
      />
      <circle cx="318" cy="212" r="6" className="lp-art__accent-fill" />

      {/* Tailored CV card (front) */}
      <g className="lp-float">
        <rect x="286" y="96" width="210" height="290" rx="18" className="lp-art__card lp-art__card--front" />
        <circle cx="322" cy="134" r="18" className="lp-art__accent-soft" />
        <circle cx="322" cy="129" r="6" className="lp-art__accent-fill" />
        <path d="M311 145 a11 9 0 0 1 22 0" className="lp-art__accent-fill" />
        <rect x="350" y="122" width="110" height="10" rx="5" className="lp-art__ink-fill" />
        <rect x="350" y="140" width="80" height="7" rx="3.5" className="lp-art__line" />

        <text x="306" y="182" className="lp-art__label">EXPERIENCE</text>
        {/* Highlighted = reprioritized toward the job */}
        <rect x="302" y="192" width="178" height="30" rx="8" className="lp-art__highlight" />
        <rect x="312" y="200" width="130" height="6" rx="3" className="lp-art__accent-fill" />
        <rect x="312" y="211" width="100" height="5" rx="2.5" className="lp-art__accent-line" />
        <rect x="302" y="228" width="178" height="30" rx="8" className="lp-art__highlight" />
        <rect x="312" y="236" width="118" height="6" rx="3" className="lp-art__accent-fill" />
        <rect x="312" y="247" width="140" height="5" rx="2.5" className="lp-art__accent-line" />
        <rect x="312" y="270" width="150" height="6" rx="3" className="lp-art__line" />
        <rect x="312" y="282" width="120" height="6" rx="3" className="lp-art__line" />

        <text x="306" y="314" className="lp-art__label">SKILLS</text>
        <rect x="306" y="322" width="46" height="16" rx="8" className="lp-art__chip lp-art__chip--on" />
        <rect x="358" y="322" width="62" height="16" rx="8" className="lp-art__chip lp-art__chip--on" />
        <rect x="426" y="322" width="50" height="16" rx="8" className="lp-art__chip" />
        <rect x="306" y="344" width="58" height="16" rx="8" className="lp-art__chip" />
        <rect x="370" y="344" width="40" height="16" rx="8" className="lp-art__chip" />
      </g>

      {/* Match gauge */}
      <g className="lp-float lp-float--delay">
        <rect x="430" y="44" width="104" height="104" rx="24" className="lp-art__card lp-art__card--front" />
        <circle cx="482" cy="92" r="30" fill="none" strokeWidth="8" className="lp-art__track" />
        <circle
          cx="482"
          cy="92"
          r="30"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${0.86 * 2 * Math.PI * 30} ${2 * Math.PI * 30}`}
          transform="rotate(-90 482 92)"
          className="lp-art__gauge"
        />
        <text x="482" y="98" textAnchor="middle" className="lp-art__gauge-text">86%</text>
        <text x="482" y="140" textAnchor="middle" className="lp-art__label">MATCH</text>
      </g>

      {/* Malware-scan badge */}
      <g className="lp-float lp-float--delay">
        <rect x="24" y="330" width="150" height="46" rx="23" className="lp-art__card lp-art__card--front" />
        <circle cx="48" cy="353" r="14" className="lp-art__ok-soft" />
        <path d="M42 353.5l4 4 8-8.5" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="lp-art__ok-stroke" />
        <text x="70" y="350" className="lp-art__badge-title">Scanned</text>
        <text x="70" y="364" className="lp-art__badge-sub">before it is read</text>
      </g>

      {/* PDF badge */}
      <g className="lp-float lp-float--slow">
        <rect x="420" y="352" width="92" height="92" rx="22" className="lp-art__warm" />
        <path d="M448 372h26l12 12v38a4 4 0 0 1-4 4h-34a4 4 0 0 1-4-4v-46a4 4 0 0 1 4-4Z" className="lp-art__paper" />
        <text x="466" y="406" textAnchor="middle" className="lp-art__pdf">PDF</text>
        <path d="M466 412v8m-4-4 4 4 4-4" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lp-art__warm-stroke" />
      </g>

      {/* Lock chip */}
      <g className="lp-float">
        <rect x="150" y="54" width="148" height="40" rx="20" className="lp-art__card lp-art__card--front" />
        <rect x="166" y="72" width="14" height="11" rx="2.5" className="lp-art__accent-fill" />
        <path d="M169 72v-3.5a4 4 0 0 1 8 0V72" fill="none" strokeWidth="2" className="lp-art__accent-stroke" />
        <text x="190" y="79" className="lp-art__badge-title">0 invented facts</text>
      </g>
    </svg>
  );
}
