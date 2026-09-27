import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { experiments } from "../lib/experiments/registry";

export const metadata: Metadata = { title: "AI Workbench" };

function ExperimentDrawing({ slug }: { slug: string }) {
  if (slug === "timeline-layout") {
    return (
      <svg
        viewBox="0 0 480 310"
        role="img"
        aria-label="A flowing timeline changing into multiple layouts"
      >
        <defs>
          <linearGradient id="timeline-flow" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#8bf3d0" />
            <stop offset="1" stopColor="#9987ff" />
          </linearGradient>
        </defs>
        <path
          className="drawing-grid"
          d="M40 54H440M40 112H440M40 170H440M40 228H440M92 32V278M174 32V278M256 32V278M338 32V278"
        />
        <path
          className="drawing-flow"
          d="M28 210C92 210 85 83 164 83s63 146 145 146c58 0 69-89 147-89"
        />
        <g className="drawing-nodes">
          <circle cx="82" cy="171" r="10" />
          <circle cx="164" cy="83" r="13" />
          <circle cx="257" cy="191" r="10" />
          <circle cx="340" cy="212" r="13" />
          <circle cx="424" cy="145" r="10" />
        </g>
        <g className="drawing-bars">
          <rect x="69" y="238" width="57" height="16" rx="8" />
          <rect x="151" y="115" width="92" height="16" rx="8" />
          <rect x="313" y="254" width="79" height="16" rx="8" />
        </g>
      </svg>
    );
  }

  if (slug === "ui-playground") {
    return (
      <svg
        viewBox="0 0 480 310"
        role="img"
        aria-label="A playful stack of interface surfaces and controls"
      >
        <defs>
          <linearGradient id="ui-surface" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ffd0bd" />
            <stop offset="1" stopColor="#9987ff" />
          </linearGradient>
        </defs>
        <rect
          className="ui-window ui-window--back"
          x="72"
          y="46"
          width="282"
          height="188"
          rx="22"
        />
        <rect
          className="ui-window ui-window--front"
          x="127"
          y="76"
          width="282"
          height="188"
          rx="22"
        />
        <circle className="ui-dot" cx="157" cy="106" r="6" />
        <circle className="ui-dot" cx="177" cy="106" r="6" />
        <circle className="ui-dot" cx="197" cy="106" r="6" />
        <rect
          className="ui-line"
          x="157"
          y="140"
          width="138"
          height="14"
          rx="7"
        />
        <rect
          className="ui-line ui-line--short"
          x="157"
          y="168"
          width="82"
          height="11"
          rx="6"
        />
        <rect
          className="ui-button"
          x="157"
          y="207"
          width="92"
          height="32"
          rx="16"
        />
        <circle className="ui-orbit" cx="366" cy="217" r="48" />
        <circle className="ui-orbit-dot" cx="404" cy="187" r="11" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 480 310"
      role="img"
      aria-label="Three AI model signals converging into one evaluation"
    >
      <defs>
        <radialGradient id="eval-core">
          <stop stopColor="#fff3d8" />
          <stop offset="0.34" stopColor="#ffb892" />
          <stop offset="1" stopColor="#9b82ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle
        className="eval-ring eval-ring--outer"
        cx="240"
        cy="155"
        r="116"
      />
      <circle
        className="eval-ring eval-ring--middle"
        cx="240"
        cy="155"
        r="78"
      />
      <circle className="eval-core" cx="240" cy="155" r="58" />
      <path className="eval-signal" d="M42 91C119 91 127 137 183 137" />
      <path className="eval-signal" d="M44 224C125 224 137 174 183 174" />
      <path className="eval-signal" d="M436 155H299" />
      <g className="eval-source">
        <circle cx="44" cy="91" r="13" />
        <circle cx="44" cy="224" r="13" />
        <circle cx="436" cy="155" r="13" />
      </g>
      <path
        className="eval-spark"
        d="m240 119 9 27 28 9-28 9-9 27-9-27-28-9 28-9Z"
      />
    </svg>
  );
}

export default function LabsHomePage() {
  const featured =
    experiments.find((experiment) => experiment.featured) ?? experiments[0];

  return (
    <main className="labs-home">
      <section className="labs-hero" aria-labelledby="labs-hero-title">
        <Image
          src="/art/ai-atelier-hero.png"
          alt="Abstract ribbons, signals, and glass forms converging around a luminous intelligence"
          fill
          priority
          sizes="(max-width: 760px) 100vw, 1200px"
          className="labs-hero__art labs-hero__art--dark"
        />
        <Image
          src="/art/ai-atelier-hero-light.png"
          alt=""
          fill
          priority
          sizes="(max-width: 760px) 100vw, 1200px"
          className="labs-hero__art labs-hero__art--light"
        />
        <div className="labs-hero__veil" />
        <div className="labs-hero__copy">
          <div className="labs-eyebrow">
            <span className="labs-signal" aria-hidden="true" />
            AI experiments, in the open
          </div>
          <h1 id="labs-hero-title">
            Ideas become
            <span> tangible here.</span>
          </h1>
          <p>
            Play with the prototypes shaping how we build, evaluate, and imagine
            with AI.
          </p>
          <div className="labs-hero__actions">
            <Link
              href={featured ? `/experiments/${featured.slug}` : "/experiments"}
              className="labs-button labs-button--primary"
            >
              Enter the workbench <span aria-hidden="true">↗</span>
            </Link>
            <Link
              href="/experiments"
              className="labs-button labs-button--quiet"
            >
              See all experiments
            </Link>
          </div>
        </div>
        <div
          className="labs-hero__telemetry"
          aria-label={`${experiments.length} prototypes currently in the lab`}
        >
          <span>
            <strong>{String(experiments.length).padStart(2, "0")}</strong>{" "}
            prototypes
          </span>
          <span className="labs-hero__wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>live workspace</span>
        </div>
      </section>

      <section
        className="labs-experiments"
        aria-labelledby="experiments-heading"
      >
        <header className="labs-section-heading">
          <div>
            <div className="labs-eyebrow">
              <span>02</span> Now in the lab
            </div>
            <h2 id="experiments-heading">Pick a thread. Pull on it.</h2>
          </div>
          <p>Every study is interactive, unfinished, and here to be touched.</p>
        </header>

        <div className="labs-experiment-grid">
          {experiments.map((experiment, index) => (
            <Link
              href={`/experiments/${experiment.slug}`}
              className={`labs-experiment labs-experiment--${index + 1}`}
              key={experiment.slug}
            >
              <div className="labs-experiment__drawing">
                <ExperimentDrawing slug={experiment.slug} />
              </div>
              <div className="labs-experiment__meta">
                <span>{experiment.category}</span>
                <span>{experiment.status}</span>
              </div>
              <div className="labs-experiment__title">
                <div>
                  <h3>{experiment.title}</h3>
                  <p>{experiment.tagline}</p>
                </div>
                <span className="labs-experiment__arrow" aria-hidden="true">
                  ↗
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="labs-process" aria-labelledby="process-heading">
        <div className="labs-process__intro">
          <div className="labs-eyebrow">
            <span>03</span> The loop
          </div>
          <h2 id="process-heading">
            Small experiments.
            <br />
            Useful signals.
          </h2>
        </div>
        <ol className="labs-process__path">
          <li>
            <span className="labs-process__node">
              <i />
            </span>
            <div>
              <strong>Imagine</strong>
              <small>Start with a sharp question.</small>
            </div>
          </li>
          <li>
            <span className="labs-process__node">
              <i />
            </span>
            <div>
              <strong>Prototype</strong>
              <small>Make the idea touchable.</small>
            </div>
          </li>
          <li>
            <span className="labs-process__node">
              <i />
            </span>
            <div>
              <strong>Learn</strong>
              <small>Keep what earns its place.</small>
            </div>
          </li>
        </ol>
      </section>
    </main>
  );
}
