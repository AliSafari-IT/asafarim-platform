import type { ReactNode } from "react";

/** A row of number tiles, each with an optional small visual beside it. */
export function StatRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="rx-stats" aria-label={label}>
      {children}
    </section>
  );
}

export function StatTile({
  value,
  label,
  hint,
  visual,
  tone = "accent",
}: {
  value: ReactNode;
  label: string;
  hint?: string;
  visual?: ReactNode;
  tone?: "accent" | "warm" | "ok" | "muted";
}) {
  return (
    <div className={`rx-stat rx-stat--${tone}`}>
      {visual ? (
        <span className="rx-stat__visual" aria-hidden="true">
          {visual}
        </span>
      ) : null}
      <div>
        <strong className="rx-stat__value">{value}</strong>
        <span className="rx-stat__label">{label}</span>
        {hint ? <span className="rx-stat__hint">{hint}</span> : null}
      </div>
    </div>
  );
}

/** A small progress ring: `value` of `max`, with the centre text given. */
export function Ring({ value, max, text }: { value: number; max: number; text: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const share = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <svg viewBox="0 0 80 80" className="rx-ring">
      <circle cx="40" cy="40" r={r} className="rx-ring__track" />
      <circle
        cx="40"
        cy="40"
        r={r}
        className="rx-ring__arc"
        strokeDasharray={`${c * share} ${c}`}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="45" textAnchor="middle" className="rx-ring__text">
        {text}
      </text>
    </svg>
  );
}
