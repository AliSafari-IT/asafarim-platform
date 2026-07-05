import type { ReactNode } from "react";

const tones = {
  neutral: { bg: "#1e293b", fg: "#cbd5e1" },
  info: { bg: "#0c4a6e", fg: "#7dd3fc" },
  success: { bg: "#14532d", fg: "#86efac" },
  warning: { bg: "#713f12", fg: "#fde047" },
  danger: { bg: "#7f1d1d", fg: "#fca5a5" },
} as const;

export type BadgeTone = keyof typeof tones;

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = "neutral", children }: BadgeProps) {
  const colors = tones[tone];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.1rem 0.55rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        backgroundColor: colors.bg,
        color: colors.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
