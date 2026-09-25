"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/**
 * "Same events, many layouts": one five-event story redrawn as a miniature
 * of each layout the editor offers. The miniatures are hand-drawn SVG, not
 * the real renderers — the real ones need a full timeline row and are sized
 * for the viewer, not for a 520px stage. Tabs follow the WAI-ARIA tabs
 * pattern (arrow keys move between them).
 */

const EVENTS = [
  { month: 0, m: "Jan", t: "Idea" },
  { month: 2, m: "Mar", t: "Prototype" },
  { month: 5, m: "Jun", t: "Beta" },
  { month: 8, m: "Sep", t: "Launch" },
  { month: 11, m: "Dec", t: "1k users" },
];

function Vertical() {
  return (
    <>
      <line x1="150" y1="30" x2="150" y2="250" className="hp-mini__axis" />
      {EVENTS.map((e, i) => {
        const y = 40 + i * 50;
        return (
          <g key={e.t}>
            <text x="128" y={y + 4} textAnchor="end" className="hp-mini__m">{e.m}</text>
            <circle cx="150" cy={y} r="8" className={i === 3 ? "hp-mini__node hp-mini__node--hot" : "hp-mini__node"} />
            <rect x="172" y={y - 17} width="200" height="34" rx="9" className="hp-mini__card" />
            <text x="186" y={y + 5} className="hp-mini__t">{e.t}</text>
          </g>
        );
      })}
    </>
  );
}

function Horizontal({ zigzag = false }: { zigzag?: boolean }) {
  return (
    <>
      <line x1="40" y1="140" x2="480" y2="140" className="hp-mini__axis" />
      {EVENTS.map((e, i) => {
        const x = 60 + i * 100;
        const up = !zigzag || i % 2 === 0;
        const cardY = up ? 70 : 170;
        return (
          <g key={e.t}>
            <line x1={x} y1={up ? cardY + 38 : 148} x2={x} y2={up ? 132 : cardY} className="hp-mini__stem" />
            <rect x={x - 46} y={cardY} width="92" height="38" rx="9" className="hp-mini__card" />
            <text x={x} y={cardY + 24} textAnchor="middle" className="hp-mini__t">{e.t}</text>
            <circle cx={x} cy="140" r="8" className={i === 3 ? "hp-mini__node hp-mini__node--hot" : "hp-mini__node"} />
            <text x={x} y={up ? 170 : 122} textAnchor="middle" className="hp-mini__m">{e.m}</text>
          </g>
        );
      })}
    </>
  );
}

function Radial() {
  const cx = 260;
  const cy = 140;
  return (
    <>
      <circle cx={cx} cy={cy} r="88" className="hp-mini__ring" />
      <text x={cx} y={cy - 2} textAnchor="middle" className="hp-mini__big">2025</text>
      <text x={cx} y={cy + 18} textAnchor="middle" className="hp-mini__m">one year</text>
      {EVENTS.map((e, i) => {
        const a = ((-90 + (e.month / 12) * 360) * Math.PI) / 180;
        const x = cx + 88 * Math.cos(a);
        const y = cy + 88 * Math.sin(a);
        const lx = cx + 128 * Math.cos(a);
        const ly = cy + 124 * Math.sin(a);
        const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
        return (
          <g key={e.t}>
            <circle cx={x} cy={y} r="9" className={i === 3 ? "hp-mini__node hp-mini__node--hot" : "hp-mini__node"} />
            <text x={lx} y={ly + 4} textAnchor={anchor} className="hp-mini__t">
              {e.t} <tspan className="hp-mini__m">{e.m}</tspan>
            </text>
          </g>
        );
      })}
    </>
  );
}

function Gantt() {
  const x0 = 130;
  const cw = 31;
  const durations = [2, 3, 3, 2, 1];
  return (
    <>
      {"JFMAMJJASOND".split("").map((l, i) => (
        <g key={i}>
          <text x={x0 + i * cw + cw / 2} y="30" textAnchor="middle" className="hp-mini__m">{l}</text>
          <line x1={x0 + i * cw} y1="40" x2={x0 + i * cw} y2="258" className="hp-mini__grid" />
        </g>
      ))}
      {EVENTS.map((e, i) => {
        const y = 50 + i * 42;
        return (
          <g key={e.t}>
            <text x="116" y={y + 17} textAnchor="end" className="hp-mini__t">{e.t}</text>
            <rect
              x={x0 + e.month * cw + 2}
              y={y}
              width={Math.min(durations[i]!, 12 - e.month) * cw - 4}
              height="24"
              rx="7"
              className={i === 3 ? "hp-mini__bar hp-mini__bar--hot" : "hp-mini__bar"}
            />
          </g>
        );
      })}
    </>
  );
}

function Roadmap() {
  const pts = [
    [50, 220],
    [150, 160],
    [250, 96],
    [370, 176],
    [470, 84],
  ] as const;
  return (
    <>
      <path
        d="M50 220 Q100 220 150 160 T 250 96 T 370 176 T 470 84"
        className="hp-mini__road"
      />
      <path
        d="M50 220 Q100 220 150 160 T 250 96 T 370 176 T 470 84"
        className="hp-mini__road-dash"
      />
      {EVENTS.map((e, i) => {
        const [x, y] = pts[i]!;
        return (
          <g key={e.t}>
            <line x1={x} y1={y} x2={x} y2={y - 40} className="hp-mini__pole" />
            <path d={`M${x} ${y - 40} l26 8 -26 8Z`} className={i === 3 ? "hp-mini__flag hp-mini__flag--hot" : "hp-mini__flag"} />
            <text x={x} y={y + 24} textAnchor="middle" className="hp-mini__t">{e.t}</text>
            <text x={x + 30} y={y - 29} className="hp-mini__m">{e.m}</text>
          </g>
        );
      })}
    </>
  );
}

function Calendar() {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (
    <>
      {names.map((n, i) => {
        const c = i % 6;
        const r = Math.floor(i / 6);
        const x = 22 + c * 80;
        const y = 24 + r * 120;
        const ev = EVENTS.find((e) => e.month === i);
        return (
          <g key={n}>
            <rect x={x} y={y} width="74" height="110" rx="10" className={ev ? "hp-mini__cell hp-mini__cell--on" : "hp-mini__cell"} />
            <text x={x + 10} y={y + 20} className="hp-mini__m">{n}</text>
            {ev ? (
              <>
                <rect x={x + 7} y={y + 66} width="60" height="26" rx="7" className={ev.month === 8 ? "hp-mini__bar hp-mini__bar--hot" : "hp-mini__bar"} />
                <text x={x + 37} y={y + 83} textAnchor="middle" className="hp-mini__chip-t">{ev.t}</text>
              </>
            ) : null}
          </g>
        );
      })}
    </>
  );
}

function Branch() {
  return (
    <>
      <line x1="40" y1="100" x2="490" y2="100" className="hp-mini__axis" />
      <path d="M150 100 C 190 100, 190 200, 240 200 L 320 200 C 360 200, 360 100, 390 100" className="hp-mini__branch" />
      {[
        { x: 70, y: 100, e: EVENTS[0]! },
        { x: 150, y: 100, e: EVENTS[1]! },
        { x: 280, y: 200, e: EVENTS[2]! },
        { x: 390, y: 100, e: EVENTS[3]! },
        { x: 470, y: 100, e: EVENTS[4]! },
      ].map(({ x, y, e }, i) => (
        <g key={e.t}>
          <circle cx={x} cy={y} r="9" className={i === 3 ? "hp-mini__node hp-mini__node--hot" : i === 2 ? "hp-mini__node hp-mini__node--alt" : "hp-mini__node"} />
          <text x={x} y={y - 20} textAnchor="middle" className="hp-mini__t">{e.t}</text>
          <text x={x} y={y + 28} textAnchor="middle" className="hp-mini__m">{e.m}</text>
        </g>
      ))}
      <text x="280" y="250" textAnchor="middle" className="hp-mini__m">a side story that rejoins the main line</text>
    </>
  );
}

const LAYOUTS: { id: string; label: string; hint: string; draw: () => ReactNode }[] = [
  { id: "vertical", label: "Vertical", hint: "Reads top to bottom — great for long histories.", draw: () => <Vertical /> },
  { id: "horizontal", label: "Horizontal", hint: "A left-to-right line, like a slide.", draw: () => <Horizontal /> },
  { id: "zigzag", label: "Zigzag", hint: "Cards alternate sides, so dense years stay readable.", draw: () => <Horizontal zigzag /> },
  { id: "radial", label: "Circular", hint: "A year as a clock face — cycles and seasons.", draw: () => <Radial /> },
  { id: "gantt", label: "Gantt", hint: "Durations, not just dates — for project schedules.", draw: () => <Gantt /> },
  { id: "roadmap", label: "Roadmap", hint: "Milestones along a road — for where you are going.", draw: () => <Roadmap /> },
  { id: "calendar", label: "Calendar", hint: "Months as a grid — see the busy and quiet stretches.", draw: () => <Calendar /> },
  { id: "branch", label: "Branching", hint: "A main line with side stories that fork and rejoin.", draw: () => <Branch /> },
];

export function LayoutShowcase() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = LAYOUTS[active]!;

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (active + delta + LAYOUTS.length) % LAYOUTS.length;
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="hp-layouts">
      <div className="hp-layouts__tabs" role="tablist" aria-label="Timeline layouts" onKeyDown={onKey}>
        {LAYOUTS.map((layout, i) => (
          <button
            key={layout.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`hp-tab-${layout.id}`}
            aria-selected={i === active}
            aria-controls="hp-layout-panel"
            tabIndex={i === active ? 0 : -1}
            className={i === active ? "hp-layouts__tab hp-layouts__tab--active" : "hp-layouts__tab"}
            onClick={() => setActive(i)}
          >
            {layout.label}
          </button>
        ))}
      </div>

      <div
        className="hp-layouts__stage"
        role="tabpanel"
        id="hp-layout-panel"
        aria-labelledby={`hp-tab-${current.id}`}
      >
        <svg key={current.id} className="hp-mini" viewBox="0 0 520 280" role="img" aria-label={`${current.label} layout of a five-event example timeline`}>
          {current.draw()}
        </svg>
        <p className="hp-layouts__hint">
          <strong>{current.label}.</strong> {current.hint}
        </p>
      </div>
      <p className="hp-layouts__more">Plus a dark monthly calendar board and an interactive layout in the editor.</p>
    </div>
  );
}
