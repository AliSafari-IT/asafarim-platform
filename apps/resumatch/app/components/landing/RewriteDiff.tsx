/**
 * "What tailoring actually does", drawn instead of described: the same five
 * experience bullets before and after, with curves showing where each one
 * moved. Every right-hand bullet traces back to a left-hand one — that is
 * the whole "never a fabricated fact" promise, made visible.
 *
 * Rows have a fixed height so the connector SVG (a plain 100-wide viewBox
 * stretched to the column) can place its curve ends at exact row centres.
 */

const ROW_H = 56;
const GAP = 10;

const BEFORE = [
  "Led migration of the billing service to Go",
  "Mentored four junior engineers",
  "Rebuilt the checkout UI in React + TypeScript",
  "Cut page load time by 40%",
  "Ran a WCAG 2.1 AA accessibility audit",
];

/** `from` indexes BEFORE; `reworded` marks a bullet whose wording changed. */
const AFTER = [
  { from: 2, text: "Rebuilt the checkout experience in React and TypeScript", reworded: true },
  { from: 4, text: "Audited the product against WCAG 2.1 AA and fixed the gaps", reworded: true },
  { from: 3, text: "Cut page load time by 40%", reworded: false },
  { from: 1, text: "Mentored four junior engineers", reworded: false },
  { from: 0, text: "Led migration of the billing service to Go", reworded: false },
];

const centre = (i: number) => i * (ROW_H + GAP) + ROW_H / 2;
const HEIGHT = BEFORE.length * ROW_H + (BEFORE.length - 1) * GAP;

export function RewriteDiff() {
  return (
    <figure className="lp-diff" style={{ ["--lp-row-h" as string]: `${ROW_H}px`, ["--lp-row-gap" as string]: `${GAP}px` }}>
      <div className="lp-diff__col">
        <p className="lp-diff__head">
          <span className="lp-diff__dot" /> Your confirmed profile
        </p>
        <ol className="lp-diff__list">
          {BEFORE.map((text, i) => (
            <li key={text} className="lp-diff__row">
              <span className="lp-diff__n">{i + 1}</span>
              {text}
            </li>
          ))}
        </ol>
      </div>

      <svg
        className="lp-diff__links"
        viewBox={`0 0 100 ${HEIGHT}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ height: HEIGHT }}
      >
        {AFTER.map((row, to) => {
          const y1 = centre(row.from);
          const y2 = centre(to);
          const moved = row.from !== to;
          return (
            <path
              key={row.text}
              d={`M0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`}
              fill="none"
              vectorEffect="non-scaling-stroke"
              className={moved && row.from > to ? "lp-diff__link lp-diff__link--up" : "lp-diff__link"}
            />
          );
        })}
      </svg>

      <div className="lp-diff__col">
        <p className="lp-diff__head">
          <span className="lp-diff__dot lp-diff__dot--accent" /> Tailored for “Frontend Engineer”
        </p>
        <ol className="lp-diff__list">
          {AFTER.map((row, to) => (
            <li
              key={row.text}
              className={row.from > to ? "lp-diff__row lp-diff__row--up" : "lp-diff__row"}
            >
              <span className="lp-diff__n">{to + 1}</span>
              <span className="lp-diff__text">{row.text}</span>
              <span className="lp-diff__tags">
                {row.from > to ? <span className="lp-tag lp-tag--up">▲ was #{row.from + 1}</span> : null}
                {row.reworded ? <span className="lp-tag">reworded</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="lp-diff__caption">
        Illustrative example. Same five facts on both sides — reordered toward the job, two reworded,
        none added.
      </figcaption>
    </figure>
  );
}
