"use client";

import { useMemo, useState } from "react";
import { Kicker } from "./Kicker";

/**
 * Shared roadmap / changelog surface for every platform app.
 *
 * One data shape (`RoadmapItem[]`) drives two mirrored timelines: a
 * "Changelog" of what has shipped and a "Roadmap" of what is planned, with a
 * segmented control to focus either side. Purely presentational and
 * token-themed — an app passes its own milestones and nothing else.
 */
export type RoadmapStatus = "shipped" | "in-progress" | "planned" | "exploring";

export type RoadmapView = "history" | "roadmap" | "all";

export interface RoadmapLink {
  label: string;
  href: string;
}

export interface RoadmapItem {
  /** Short handle shown on the marker row, e.g. "M03" or "v1.2.0". */
  id: string;
  title: string;
  status: RoadmapStatus;
  /** Free-text date or window, e.g. "Shipped Sep 2026" or "Q1 2027". */
  timeframe?: string;
  summary?: string;
  highlights?: string[];
  tags?: string[];
  /** PRs, issues, docs. Rendered as plain links. */
  links?: RoadmapLink[];
}

export interface RoadmapLabels {
  history: string;
  roadmap: string;
  all: string;
  changelogTitle: string;
  changelogSubtitle: string;
  roadmapTitle: string;
  roadmapSubtitle: string;
  /** `{done}` and `{total}` are substituted. */
  progress: string;
  status: Record<RoadmapStatus, string>;
}

export interface RoadmapProps {
  items: RoadmapItem[];
  title?: string;
  description?: string;
  kicker?: string;
  kickerIndex?: string;
  defaultView?: RoadmapView;
  /** Hide the History / Roadmap / All control (renders `defaultView`). */
  hideToggle?: boolean;
  /** Override any label for localization. */
  labels?: Partial<RoadmapLabels> & { status?: Partial<Record<RoadmapStatus, string>> };
}

const DEFAULTS: RoadmapLabels = {
  history: "History",
  roadmap: "Roadmap",
  all: "All",
  changelogTitle: "Changelog",
  changelogSubtitle: "What has shipped",
  roadmapTitle: "Roadmap",
  roadmapSubtitle: "What is planned next",
  progress: "{done} of {total} shipped",
  status: {
    shipped: "Shipped",
    "in-progress": "In progress",
    planned: "Planned",
    exploring: "Exploring",
  },
};

const MARKER: Record<RoadmapStatus, string> = {
  shipped: "✓",
  "in-progress": "◐",
  planned: "○",
  exploring: "◇",
};

const HISTORY_STATUSES: RoadmapStatus[] = ["shipped", "in-progress"];
const FUTURE_STATUSES: RoadmapStatus[] = ["planned", "exploring"];

export function Roadmap({
  items,
  title,
  description,
  kicker,
  kickerIndex,
  defaultView = "all",
  hideToggle = false,
  labels,
}: RoadmapProps) {
  const [view, setView] = useState<RoadmapView>(defaultView);

  const t: RoadmapLabels = {
    ...DEFAULTS,
    ...labels,
    status: { ...DEFAULTS.status, ...labels?.status },
  };

  const history = useMemo(
    () => items.filter((i) => HISTORY_STATUSES.includes(i.status)),
    [items],
  );
  const future = useMemo(
    () => items.filter((i) => FUTURE_STATUSES.includes(i.status)),
    [items],
  );
  const shipped = useMemo(
    () => items.filter((i) => i.status === "shipped").length,
    [items],
  );

  const options: RoadmapView[] = ["history", "roadmap", "all"];
  const label: Record<RoadmapView, string> = {
    history: t.history,
    roadmap: t.roadmap,
    all: t.all,
  };

  return (
    <section className="ui-roadmap">
      <header className="ui-roadmap__head">
        {kicker ? <Kicker index={kickerIndex}>{kicker}</Kicker> : null}
        {title ? <h1>{title}</h1> : null}
        {description ? <p className="ui-roadmap__desc">{description}</p> : null}
        {items.length > 0 ? (
          <div
            className="ui-roadmap__progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={shipped}
          >
            <span
              className="ui-roadmap__progress-fill"
              style={{ width: `${(shipped / items.length) * 100}%` }}
            />
            <span className="ui-roadmap__progress-text">
              {t.progress
                .replace("{done}", String(shipped))
                .replace("{total}", String(items.length))}
            </span>
          </div>
        ) : null}
      </header>

      {!hideToggle ? (
        <div className="ui-roadmap__toggle" role="group" aria-label="Timeline view">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={view === opt ? "is-active" : ""}
              aria-pressed={view === opt}
              onClick={() => setView(opt)}
            >
              {label[opt]}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`ui-roadmap__cols ui-roadmap__cols--${view}`}>
        {view !== "roadmap" ? (
          <RoadmapColumn
            title={t.changelogTitle}
            subtitle={t.changelogSubtitle}
            items={history}
            labels={t}
          />
        ) : null}
        {view !== "history" ? (
          <RoadmapColumn
            title={t.roadmapTitle}
            subtitle={t.roadmapSubtitle}
            items={future}
            labels={t}
          />
        ) : null}
      </div>
    </section>
  );
}

function RoadmapColumn({
  title,
  subtitle,
  items,
  labels,
}: {
  title: string;
  subtitle: string;
  items: RoadmapItem[];
  labels: RoadmapLabels;
}) {
  return (
    <div className="ui-roadmap__col">
      <div className="ui-roadmap__col-head">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <ol className="ui-roadmap__list">
        {items.map((item) => (
          <li
            key={item.id + item.title}
            className={`ui-roadmap__item ui-roadmap__item--${item.status}`}
          >
            <span className="ui-roadmap__marker" aria-hidden="true">
              {MARKER[item.status]}
            </span>
            <div className="ui-roadmap__card">
              <div className="ui-roadmap__meta">
                <span className="ui-roadmap__id">{item.id}</span>
                {item.timeframe ? <span>{item.timeframe}</span> : null}
                <span className="ui-roadmap__status">{labels.status[item.status]}</span>
              </div>
              <h3>{item.title}</h3>
              {item.summary ? <p>{item.summary}</p> : null}
              {item.highlights && item.highlights.length > 0 ? (
                <ul>
                  {item.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              ) : null}
              {item.tags && item.tags.length > 0 ? (
                <div className="ui-roadmap__tags">
                  {item.tags.map((tag) => (
                    <span key={tag} className="ui-roadmap__tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {item.links && item.links.length > 0 ? (
                <div className="ui-roadmap__links">
                  {item.links.map((l) => (
                    <a key={l.href} href={l.href}>
                      {l.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
