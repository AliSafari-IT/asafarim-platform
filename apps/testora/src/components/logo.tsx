interface LogoProps {
  className?: string;
}

/**
 * The e2e-testora brand mark: a bold white checkmark on a violet→sky
 * squircle, with a bright outline so the shape stays visible on both light
 * and dark backgrounds.
 */
export function Logo({ className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="e2e-testora"
      className={className}
    >
      <defs>
        <linearGradient id="logo-bg" x1="40" y1="32" x2="472" y2="488" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ab90fb" />
          <stop offset="0.5" stopColor="#7c5cf6" />
          <stop offset="1" stopColor="#1fb1f3" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="512" height="512" rx="124" fill="url(#logo-bg)" />

      {/* A bright outline so the gradient squircle shape is visible on dark backgrounds. */}
      <rect
        x="12"
        y="12"
        width="488"
        height="488"
        rx="118"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="12"
      />

      {/* Bold white checkmark that stays legible over the gradient. */}
      <path
        d="M140 256 L215 332 Q300 300 404 150"
        fill="none"
        stroke="#ffffff"
        strokeWidth="72"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
