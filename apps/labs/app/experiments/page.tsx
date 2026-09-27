import type { Metadata } from "next";
import Link from "next/link";
import {
  experiments,
  type ExperimentCategory,
  type ExperimentStatus,
} from "../../lib/experiments/registry";

export const metadata: Metadata = { title: "Experiments" };

const CATEGORIES: ExperimentCategory[] = [
  "AI",
  "UI",
  "Audio",
  "Data",
  "DevTools",
];
const STATUSES: ExperimentStatus[] = [
  "prototype",
  "active",
  "beta",
  "paused",
  "archived",
];

function CatalogueDrawing({ slug }: { slug: string }) {
  if (slug === "timeline-layout") {
    return (
      <svg
        viewBox="0 0 640 360"
        role="img"
        aria-label="A timeline transforming across multiple layouts"
      >
        <defs>
          <linearGradient id="catalogue-timeline" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#8bf3d0" />
            <stop offset="1" stopColor="#9f8fff" />
          </linearGradient>
        </defs>
        <g className="catalogue-grid">
          <path d="M70 62H570M70 122H570M70 182H570M70 242H570M70 302H570" />
          <path d="M130 34V326M250 34V326M370 34V326M490 34V326" />
        </g>
        <path
          className="catalogue-path"
          d="M53 247C121 247 128 93 218 93s85 169 176 169c73 0 84-119 193-119"
        />
        <g className="catalogue-points">
          <circle cx="104" cy="210" r="12" />
          <circle cx="218" cy="93" r="16" />
          <circle cx="323" cy="218" r="12" />
          <circle cx="438" cy="230" r="16" />
          <circle cx="554" cy="150" r="12" />
        </g>
        <g className="catalogue-labels">
          <rect x="80" y="270" width="86" height="18" rx="9" />
          <rect x="238" y="62" width="118" height="18" rx="9" />
          <rect x="424" y="283" width="104" height="18" rx="9" />
        </g>
      </svg>
    );
  }

  if (slug === "ui-playground") {
    return (
      <svg
        viewBox="0 0 640 360"
        role="img"
        aria-label="Layered interface surfaces with controls and tokens"
      >
        <defs>
          <linearGradient id="catalogue-ui" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ffb698" />
            <stop offset="1" stopColor="#a994ff" />
          </linearGradient>
        </defs>
        <rect
          className="catalogue-window catalogue-window--back"
          x="86"
          y="52"
          width="360"
          height="238"
          rx="28"
        />
        <rect
          className="catalogue-window catalogue-window--front"
          x="164"
          y="83"
          width="388"
          height="244"
          rx="28"
        />
        <g className="catalogue-window-dots">
          <circle cx="202" cy="120" r="7" />
          <circle cx="227" cy="120" r="7" />
          <circle cx="252" cy="120" r="7" />
        </g>
        <rect
          className="catalogue-ui-line"
          x="204"
          y="164"
          width="172"
          height="17"
          rx="8"
        />
        <rect
          className="catalogue-ui-line catalogue-ui-line--quiet"
          x="204"
          y="199"
          width="108"
          height="13"
          rx="7"
        />
        <rect
          className="catalogue-ui-button"
          x="204"
          y="248"
          width="116"
          height="41"
          rx="20"
        />
        <circle className="catalogue-orbit" cx="494" cy="248" r="61" />
        <circle className="catalogue-orbit-point" cx="543" cy="211" r="13" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 640 360"
      role="img"
      aria-label="Model signals converging into an evaluation core"
    >
      <defs>
        <radialGradient id="catalogue-eval">
          <stop stopColor="#fff8e8" />
          <stop offset="0.28" stopColor="#ffb28f" />
          <stop offset="1" stopColor="#a38fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        className="catalogue-eval-ring catalogue-eval-ring--outer"
        cx="338"
        cy="180"
        r="132"
      />
      <circle
        className="catalogue-eval-ring catalogue-eval-ring--inner"
        cx="338"
        cy="180"
        r="88"
      />
      <circle className="catalogue-eval-core" cx="338" cy="180" r="74" />
      <path className="catalogue-signal" d="M62 87C161 87 175 157 258 157" />
      <path className="catalogue-signal" d="M62 274C165 274 179 204 258 204" />
      <path className="catalogue-signal" d="M591 180H421" />
      <g className="catalogue-sources">
        <circle cx="62" cy="87" r="15" />
        <circle cx="62" cy="274" r="15" />
        <circle cx="591" cy="180" r="15" />
      </g>
      <path
        className="catalogue-spark"
        d="m338 134 11 34 35 12-35 11-11 35-11-35-35-11 35-12Z"
      />
    </svg>
  );
}

function filterHref(category?: string, status?: string) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (status) params.set("status", status);
  const query = params.toString();
  return query ? `/experiments?${query}` : "/experiments";
}

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const requested = await searchParams;
  const category = CATEGORIES.includes(requested.category as ExperimentCategory)
    ? (requested.category as ExperimentCategory)
    : undefined;
  const status = STATUSES.includes(requested.status as ExperimentStatus)
    ? (requested.status as ExperimentStatus)
    : undefined;
  const filtered = experiments.filter(
    (experiment) =>
      (!category || experiment.category === category) &&
      (!status || experiment.status === status)
  );
  const availableCategories = CATEGORIES.filter((item) =>
    experiments.some((experiment) => experiment.category === item)
  );
  const availableStatuses = STATUSES.filter((item) =>
    experiments.some((experiment) => experiment.status === item)
  );

  return (
    <main className="labs-catalogue">
      <section
        className="labs-catalogue__hero"
        aria-labelledby="catalogue-title"
      >
        <div className="labs-catalogue__intro">
          <div className="labs-eyebrow">
            <span>02</span> Experiment catalogue
          </div>
          <h1 id="catalogue-title">
            Experiments,
            <span> not exhibits.</span>
          </h1>
          <p>
            Open the work. Change the view. See what the idea knows when it has
            to become real.
          </p>
        </div>
        <div className="labs-catalogue__orbit" aria-hidden="true">
          <span className="labs-catalogue__orbit-ring labs-catalogue__orbit-ring--one" />
          <span className="labs-catalogue__orbit-ring labs-catalogue__orbit-ring--two" />
          <span className="labs-catalogue__orbit-ring labs-catalogue__orbit-ring--three" />
          <span className="labs-catalogue__orbit-core">
            {experiments.length.toString().padStart(2, "0")}
          </span>
          <i className="labs-catalogue__satellite labs-catalogue__satellite--mint" />
          <i className="labs-catalogue__satellite labs-catalogue__satellite--lilac" />
          <i className="labs-catalogue__satellite labs-catalogue__satellite--coral" />
        </div>
      </section>

      <nav className="labs-filters" aria-label="Filter experiments">
        <div className="labs-filters__group">
          <span className="labs-filters__label">Focus</span>
          <Link
            href={filterHref(undefined, status)}
            className={!category ? "is-active" : undefined}
            aria-current={!category ? "page" : undefined}
          >
            All <small>{experiments.length}</small>
          </Link>
          {availableCategories.map((item) => {
            const count = experiments.filter(
              (experiment) => experiment.category === item
            ).length;
            return (
              <Link
                key={item}
                href={filterHref(item, status)}
                className={category === item ? "is-active" : undefined}
                aria-current={category === item ? "page" : undefined}
              >
                {item} <small>{count}</small>
              </Link>
            );
          })}
        </div>
        <div className="labs-filters__group">
          <span className="labs-filters__label">Stage</span>
          <Link
            href={filterHref(category)}
            className={!status ? "is-active" : undefined}
            aria-current={!status ? "page" : undefined}
          >
            All
          </Link>
          {availableStatuses.map((item) => (
            <Link
              key={item}
              href={filterHref(category, item)}
              className={status === item ? "is-active" : undefined}
              aria-current={status === item ? "page" : undefined}
            >
              <span className="labs-filters__status-dot" aria-hidden="true" />{" "}
              {item}
            </Link>
          ))}
        </div>
      </nav>

      <section
        className="labs-catalogue__results"
        aria-labelledby="results-heading"
      >
        <header className="labs-results-heading">
          <div>
            <span className="labs-results-heading__index">Live index</span>
            <h2 id="results-heading">
              {filtered.length}{" "}
              {filtered.length === 1 ? "experiment" : "experiments"}
            </h2>
          </div>
          <span>
            Showing {filtered.length} of {experiments.length}
          </span>
        </header>

        <div className="labs-catalogue__list">
          {filtered.map((experiment, index) => (
            <Link
              href={`/experiments/${experiment.slug}`}
              className={`labs-specimen labs-specimen--${experiment.category.toLowerCase()}`}
              key={experiment.slug}
              aria-label={`Open ${experiment.title}: ${experiment.tagline}`}
            >
              <article>
                <div className="labs-specimen__visual">
                  <span className="labs-specimen__number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <CatalogueDrawing slug={experiment.slug} />
                </div>
                <div className="labs-specimen__content">
                  <div className="labs-specimen__eyebrow">
                    <span>{experiment.category}</span>
                    <span>{experiment.status}</span>
                  </div>
                  <div>
                    <h3>{experiment.title}</h3>
                    <p className="labs-specimen__tagline">
                      {experiment.tagline}
                    </p>
                    <p className="labs-specimen__description">
                      {experiment.description}
                    </p>
                  </div>
                  <div className="labs-specimen__footer">
                    <span>v{experiment.version}</span>
                    <span className="labs-specimen__open">
                      Open experiment <i aria-hidden="true">↗</i>
                    </span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="labs-empty-state">
            <div className="labs-empty-state__signal" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <h2>No signal on this frequency.</h2>
            <p>Try a wider filter and the experiments will reappear.</p>
            <Link
              href="/experiments"
              className="labs-button labs-button--primary"
            >
              Reset filters
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
