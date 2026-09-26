/**
 * Two small, dependency-free charts for the in-app pages. Both carry a
 * text summary as the accessible name (and a native <title> per mark for
 * hover), so the numbers never live only in the picture.
 */

export interface DayCount {
  /** YYYY-MM-DD (UTC). */
  day: string;
  count: number;
}

/** Last-N-days activity as bars. Zero days still get a faint stub. */
export function ActivityBars({ days, label }: { days: DayCount[]; label: string }) {
  // Wide, flat drawing space: the panel is ~1000px on desktop, so this
  // renders near 1:1 instead of scaling bars and labels up ~2x.
  const W = 1000;
  const H = 110;
  const pad = 18;
  const max = Math.max(1, ...days.map((d) => d.count));
  const slot = (W - pad * 2) / Math.max(days.length, 1);
  const barW = Math.min(Math.max(slot - 10, 4), 34);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const busiest = days.reduce((a, b) => (b.count > a.count ? b : a), days[0] ?? { day: "", count: 0 });

  return (
    <figure className="rx-chart">
      <svg
        viewBox={`0 0 ${W} ${H + 22}`}
        className="rx-chart__svg"
        role="img"
        aria-label={`${label}: ${total} in the last ${days.length} days${
          busiest.count > 0 ? `, busiest ${busiest.day} with ${busiest.count}` : ""
        }.`}
      >
        <line x1={pad} y1={H} x2={W - pad} y2={H} className="rx-chart__base" />
        {days.map((d, i) => {
          const h = d.count === 0 ? 3 : Math.max((d.count / max) * (H - 16), 6);
          const x = pad + i * slot + (slot - barW) / 2;
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={H - h}
                width={barW}
                height={h}
                rx={4}
                className={d.count === 0 ? "rx-chart__bar rx-chart__bar--zero" : "rx-chart__bar"}
              >
                <title>{`${d.day}: ${d.count}`}</title>
              </rect>
              {d.count > 0 ? (
                <text x={x + barW / 2} y={H - h - 5} textAnchor="middle" className="rx-chart__value">
                  {d.count}
                </text>
              ) : null}
              {i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2) ? (
                <text x={x + barW / 2} y={H + 16} textAnchor="middle" className="rx-chart__axis">
                  {d.day.slice(5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Horizontal bars for a ranked list (e.g. most-tailored jobs). */
export function BarList({ items, label }: { items: { label: string; count: number; hint?: string }[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ol className="rx-barlist" aria-label={label}>
      {items.map((item) => (
        <li key={item.label} className="rx-barlist__row">
          <span className="rx-barlist__label" title={item.label}>
            {item.label}
            {item.hint ? <span className="rx-barlist__hint"> · {item.hint}</span> : null}
          </span>
          <span className="rx-barlist__track" aria-hidden="true">
            <span className="rx-barlist__fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </span>
          <span className="rx-barlist__count">{item.count}</span>
        </li>
      ))}
    </ol>
  );
}

/** Build a contiguous last-`n`-days series (UTC) from raw timestamps. */
export function lastNDays(dates: Date[], n: number, now = new Date()): DayCount[] {
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(key(d), (counts.get(key(d)) ?? 0) + 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: n }, (_, i) => {
    const day = key(new Date(end - (n - 1 - i) * 86_400_000));
    return { day, count: counts.get(day) ?? 0 };
  });
}
