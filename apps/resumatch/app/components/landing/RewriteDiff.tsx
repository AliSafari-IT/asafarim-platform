/**
 * "What tailoring actually does", drawn instead of described: the same five
 * experience bullets before and after, with curves showing where each one
 * moved. Every right-hand bullet traces back to a left-hand one — that is
 * the whole "never a fabricated fact" promise, made visible.
 *
 * Rows have a fixed height so the connector SVG (a plain 100-wide viewBox
 * stretched to the column) can place its curve ends at exact row centres.
 * The example bullets are UI copy (resumatch.landing.diff.*), so they follow
 * the UI language like the rest of the page.
 */
import type { TranslateFn } from "@asafarim/shared-i18n";

const ROW_H = 56;
const GAP = 10;

/** Dictionary keys for the five "before" bullets. */
const BEFORE = ["b1", "b2", "b3", "b4", "b5"];

/** `from` indexes BEFORE; `key` is the bullet's text afterwards — a
 *  reworded one has its own key, an unchanged one reuses its original. */
const AFTER = [
  { from: 2, key: "r3", reworded: true },
  { from: 4, key: "r5", reworded: true },
  { from: 3, key: "b4", reworded: false },
  { from: 1, key: "b2", reworded: false },
  { from: 0, key: "b1", reworded: false },
];

const centre = (i: number) => i * (ROW_H + GAP) + ROW_H / 2;
const HEIGHT = BEFORE.length * ROW_H + (BEFORE.length - 1) * GAP;

export function RewriteDiff({ t }: { t: TranslateFn }) {
  const bullet = (key: string) => t(`resumatch.landing.diff.${key}`);
  return (
    <figure className="lp-diff" style={{ ["--lp-row-h" as string]: `${ROW_H}px`, ["--lp-row-gap" as string]: `${GAP}px` }}>
      <div className="lp-diff__col">
        <p className="lp-diff__head">
          <span className="lp-diff__dot" /> {t("resumatch.landing.diff.before")}
        </p>
        <ol className="lp-diff__list">
          {BEFORE.map((key, i) => (
            <li key={key} className="lp-diff__row">
              <span className="lp-diff__n">{i + 1}</span>
              {bullet(key)}
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
              key={row.key}
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
          <span className="lp-diff__dot lp-diff__dot--accent" />{" "}
          {t("resumatch.landing.diff.after", { role: t("resumatch.landing.diff.role") })}
        </p>
        <ol className="lp-diff__list">
          {AFTER.map((row, to) => (
            <li
              key={row.key}
              className={row.from > to ? "lp-diff__row lp-diff__row--up" : "lp-diff__row"}
            >
              <span className="lp-diff__n">{to + 1}</span>
              <span className="lp-diff__text">{bullet(row.key)}</span>
              <span className="lp-diff__tags">
                {row.from > to ? (
                  <span className="lp-tag lp-tag--up">{t("resumatch.landing.diff.wasN", { n: row.from + 1 })}</span>
                ) : null}
                {row.reworded ? <span className="lp-tag">{t("resumatch.landing.diff.reworded")}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="lp-diff__caption">
        {t("resumatch.landing.diff.caption")}
      </figcaption>
    </figure>
  );
}
