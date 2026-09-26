import type { TimelineInput } from "@/lib/schemas";

/**
 * The gallery card's header art, drawn from the timeline's own data so no
 * two cards look alike: one mark per event, placed by its real date, in a
 * shape that matches the layout (bars for Gantt, a month grid for Calendar,
 * a ring for Circular, …). Server-only and deterministic — dates are read
 * in UTC so the server render can't drift from what the viewer sees.
 */

export interface GlyphEvent {
  startAt: Date | null;
  endAt: Date | null;
}

type Layout = TimelineInput["layout"];

const W = 300;
const H = 100;
const X0 = 22;
const X1 = W - 22;
const MAX_MARKS = 24;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Position of each event on 0..1 by date; evenly spaced when undated. */
function positions(events: GlyphEvent[]): number[] {
  const times = events.map((e) => e.startAt?.getTime() ?? null);
  const dated = times.filter((t): t is number => t !== null);
  const min = Math.min(...dated);
  const max = Math.max(...dated);
  const n = events.length;
  return times.map((t, i) => {
    if (t === null || dated.length < 2 || max === min) return n === 1 ? 0.5 : i / (n - 1);
    return (t - min) / (max - min);
  });
}

/** Keep the glyph readable for long timelines: sample evenly, keep ends. */
function sample<T>(items: T[]): T[] {
  if (items.length <= MAX_MARKS) return items;
  const step = (items.length - 1) / (MAX_MARKS - 1);
  return Array.from({ length: MAX_MARKS }, (_, i) => items[Math.round(i * step)]!);
}

const x = (p: number) => X0 + p * (X1 - X0);

/** Human date range across ALL events, e.g. "1876 – 2007", "Jan – Jun 2026". */
export function dateRangeLabel(events: GlyphEvent[]): string | null {
  const dated = events.flatMap((e) => [e.startAt, e.endAt]).filter((d): d is Date => d !== null);
  if (dated.length === 0) return null;
  const min = new Date(Math.min(...dated.map((d) => d.getTime())));
  const max = new Date(Math.max(...dated.map((d) => d.getTime())));
  const y0 = min.getUTCFullYear();
  const y1 = max.getUTCFullYear();
  if (y0 !== y1) return `${y0} – ${y1}`;
  const m0 = min.getUTCMonth();
  const m1 = max.getUTCMonth();
  if (m0 !== m1) return `${MONTHS[m0]} – ${MONTHS[m1]} ${y0}`;
  const d0 = min.getUTCDate();
  const d1 = max.getUTCDate();
  return d0 === d1 ? `${MONTHS[m0]} ${d0}, ${y0}` : `${MONTHS[m0]} ${d0} – ${d1}, ${y0}`;
}

function Axis({ y = 50 }: { y?: number }) {
  return <line x1={X0} y1={y} x2={X1} y2={y} className="gl-glyph__axis" />;
}

function Dot({ cx, cy, hot = false }: { cx: number; cy: number; hot?: boolean }) {
  return <circle cx={cx} cy={cy} r={hot ? 5.5 : 4.5} className={hot ? "gl-glyph__dot gl-glyph__dot--hot" : "gl-glyph__dot"} />;
}

export function CardGlyph({ layout, events }: { layout: Layout; events: GlyphEvent[] }) {
  const marks = sample(events);
  const pos = positions(marks);
  const last = marks.length - 1;
  let body: React.ReactNode;

  switch (layout) {
    case "vertical": {
      // Axis runs down the left; each event is a dot with a text-line stub.
      body = (
        <>
          <line x1="40" y1="10" x2="40" y2="90" className="gl-glyph__axis" />
          {pos.map((p, i) => {
            const cy = 12 + p * 76;
            return (
              <g key={i}>
                <line x1="52" y1={cy} x2={52 + 60 + ((i * 37) % 120)} y2={cy} className="gl-glyph__stub" />
                <Dot cx={40} cy={cy} hot={i === last} />
              </g>
            );
          })}
        </>
      );
      break;
    }
    case "zigzag":
    case "interactive":
    case "horizontal": {
      body = (
        <>
          <Axis />
          {pos.map((p, i) => {
            const cx = x(p);
            const up = layout !== "zigzag" || i % 2 === 0;
            return (
              <g key={i}>
                <line x1={cx} y1={50} x2={cx} y2={up ? 26 : 74} className="gl-glyph__stem" />
                <rect x={cx - 9} y={up ? 16 : 74} width="18" height="10" rx="3" className="gl-glyph__card" />
                <Dot cx={cx} cy={50} hot={layout === "interactive" ? i === Math.floor(last / 2) : i === last} />
              </g>
            );
          })}
          {layout === "interactive" && marks.length > 0 ? (
            <rect x={x(pos[Math.floor(last / 2)]!) - 22} y={60} width="44" height="22" rx="6" className="gl-glyph__bubble" />
          ) : null}
        </>
      );
      break;
    }
    case "radial": {
      body = (
        <>
          <circle cx={W / 2} cy={H / 2} r="36" className="gl-glyph__ring" />
          {pos.map((p, i) => {
            const a = -Math.PI / 2 + p * Math.PI * 2 * 0.92;
            return <Dot key={i} cx={W / 2 + 36 * Math.cos(a)} cy={H / 2 + 36 * Math.sin(a)} hot={i === last} />;
          })}
        </>
      );
      break;
    }
    case "gantt": {
      // One bar per event, start → end on a shared scale.
      const times = marks.flatMap((e) => [e.startAt, e.endAt]).filter((d): d is Date => d !== null).map((d) => d.getTime());
      const min = Math.min(...times);
      const span = Math.max(...times) - min || 1;
      const rows = marks.slice(0, 7);
      const rowH = 80 / Math.max(rows.length, 1);
      body = (
        <>
          {rows.map((e, i) => {
            const s = e.startAt ? (e.startAt.getTime() - min) / span : i / Math.max(rows.length, 1);
            const f = e.endAt ? (e.endAt.getTime() - min) / span : s + 0.08;
            return (
              <rect
                key={i}
                x={x(s)}
                y={10 + i * rowH + rowH * 0.18}
                width={Math.max(x(Math.min(f, 1)) - x(s), 8)}
                height={rowH * 0.64}
                rx="3"
                className={i === rows.length - 1 ? "gl-glyph__bar gl-glyph__bar--hot" : "gl-glyph__bar"}
              />
            );
          })}
        </>
      );
      break;
    }
    case "roadmap": {
      const roadY = (p: number) => 58 - Math.sin(p * Math.PI * 2) * 18;
      const d = Array.from({ length: 41 }, (_, i) => {
        const p = i / 40;
        return `${i === 0 ? "M" : "L"}${x(p).toFixed(1)} ${roadY(p).toFixed(1)}`;
      }).join(" ");
      body = (
        <>
          <path d={d} className="gl-glyph__road" />
          {pos.map((p, i) => {
            const cx = x(p);
            const cy = roadY(p);
            return (
              <g key={i}>
                <line x1={cx} y1={cy} x2={cx} y2={cy - 18} className="gl-glyph__stem" />
                <path d={`M${cx} ${cy - 18} l10 3.5 -10 3.5Z`} className={i === last ? "gl-glyph__flag gl-glyph__flag--hot" : "gl-glyph__flag"} />
              </g>
            );
          })}
        </>
      );
      break;
    }
    case "calendar":
    case "calendar-board": {
      // Twelve months; each cell's depth is how many events fall in it.
      const counts = Array.from({ length: 12 }, () => 0);
      for (const e of events) if (e.startAt) counts[e.startAt.getUTCMonth()]! += 1;
      const peak = Math.max(...counts, 1);
      body = (
        <>
          {counts.map((c, m) => (
            <rect
              key={m}
              x={X0 + (m % 6) * 43.5}
              y={14 + Math.floor(m / 6) * 38}
              width="38"
              height="32"
              rx="5"
              className="gl-glyph__cell"
              style={{ fillOpacity: c === 0 ? undefined : 0.3 + 0.7 * (c / peak) }}
              data-on={c > 0 ? "" : undefined}
            />
          ))}
        </>
      );
      break;
    }
    case "branch": {
      // Main line with a side branch; every third event sits on the branch.
      body = (
        <>
          <Axis y={38} />
          <path d={`M${x(0.25)} 38 C ${x(0.35)} 38, ${x(0.35)} 72, ${x(0.45)} 72 L ${x(0.62)} 72 C ${x(0.72)} 72, ${x(0.72)} 38, ${x(0.82)} 38`} className="gl-glyph__branch" />
          {pos.map((p, i) => {
            const onBranch = i % 3 === 2 && p > 0.3 && p < 0.75;
            return <Dot key={i} cx={x(onBranch ? Math.min(Math.max(p, 0.46), 0.6) : p)} cy={onBranch ? 72 : 38} hot={i === last} />;
          })}
        </>
      );
      break;
    }
    default:
      body = <Axis />;
  }

  return (
    <svg className="gl-glyph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {body}
    </svg>
  );
}
