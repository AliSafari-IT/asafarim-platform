import Link from "next/link";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseNotice } from "@asafarim/ui";
import { THEME_PRESETS } from "@/lib/timeline-config";
import { HeroScene } from "@/components/landing/HeroScene";
import { LayoutShowcase } from "@/components/landing/LayoutShowcase";
import {
  ArrowRightIcon,
  DownloadIcon,
  GlobeIcon,
  LockIcon,
  PaletteIcon,
  PenIcon,
  ShieldIcon,
  SparkIcon,
  UndoIcon,
  WarningIcon,
} from "@/components/landing/icons";

const showcase = getShowcaseProject("timelineai")!;

/* Links here are plain classes, not @asafarim/ui's ButtonLink: every .hp-btn
   rule is scoped under [data-app="timelineai"], which outranks base.css's
   unlayered `a { color: var(--accent) }` — the cascade trap that once made
   a Tailwind-styled button label invisible on this page. */

/** Text colour per theme preview; THEME_PRESETS only carries swatches. */
const THEME_INK: Record<string, string> = {
  canvas: "#1b1730",
  midnight: "#f1eefc",
  editorial: "#241d17",
};

export default function HomePage() {
  return (
    <div className="hp">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="hp-hero">
        <div className="hp-hero__copy">
          <span className="hp-kicker">
            <span className="hp-kicker__pulse" /> Free · no account needed
          </span>
          <h1 className="hp-hero__title">
            Turn scattered dates into a <span className="hp-hero__accent">story</span>.
          </h1>
          <p className="hp-hero__lead">
            Build polished, visual timelines — project plans, roadmaps, history, Gantt charts — in
            ten layouts and three themes. AI helps you draft; you decide what stays.
          </p>
          <div className="hp-hero__ctas">
            <Link href="/create" className="hp-btn hp-btn--primary">
              Create a timeline <ArrowRightIcon />
            </Link>
            <Link href="/gallery" className="hp-btn hp-btn--ghost">
              Browse the gallery
            </Link>
          </div>
          <p className="hp-hero__note">
            Already have an account? <Link href="/dashboard">Open your dashboard</Link> ·{" "}
            <Link href="/roadmap">See the roadmap</Link>
          </p>
        </div>
        <div className="hp-hero__art">
          <HeroScene />
        </div>
      </section>

      <ShowcaseNotice
        content={showcase}
        renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
      />

      {/* ─── Numbers ──────────────────────────────────────────────────── */}
      <section className="hp-stats" aria-label="TimelineAI at a glance">
        <div className="hp-stat">
          <span className="hp-stat__viz hp-stat__viz--grid" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <i key={i} />
            ))}
          </span>
          <strong>10</strong>
          <span>layouts</span>
        </div>
        <div className="hp-stat">
          <span className="hp-stat__viz hp-stat__viz--swatches" aria-hidden="true">
            {THEME_PRESETS.map((t) => (
              <i key={t.id} style={{ background: t.swatch[2], boxShadow: `0 0 0 3px ${t.swatch[0]}` }} />
            ))}
          </span>
          <strong>{THEME_PRESETS.length}</strong>
          <span>themes</span>
        </div>
        <div className="hp-stat">
          <span className="hp-stat__viz hp-stat__viz--files" aria-hidden="true">
            <i>PNG</i>
            <i>JPG</i>
            <i>PDF</i>
          </span>
          <strong>3</strong>
          <span>export formats</span>
        </div>
        <div className="hp-stat">
          <span className="hp-stat__viz hp-stat__viz--zero" aria-hidden="true">
            <LockIcon />
          </span>
          <strong>0</strong>
          <span>sign-ups to start</span>
        </div>
      </section>

      {/* ─── Layouts ──────────────────────────────────────────────────── */}
      <section className="hp-section">
        <header className="hp-section__head">
          <span className="hp-kicker">Layouts</span>
          <h2 className="hp-section__title">Same five events. Ten ways to tell them.</h2>
          <p className="hp-section__lead">
            Switch layout at any time — your content never changes, only how it is drawn.
          </p>
        </header>
        <LayoutShowcase />
      </section>

      {/* ─── How it works, as a timeline ─────────────────────────────── */}
      <section className="hp-section">
        <header className="hp-section__head">
          <span className="hp-kicker">How it works</span>
          <h2 className="hp-section__title">Three stops from blank page to finished timeline.</h2>
        </header>
        <ol className="hp-steps">
          <li className="hp-step">
            <div className="hp-step__card">
              <span className="hp-step__icon">
                <PenIcon />
              </span>
              <h3>Add your events</h3>
              <p>Type them in, or paste notes and let the copilot pull out the dates.</p>
            </div>
            <span className="hp-step__dot">1</span>
          </li>
          <li className="hp-step hp-step--down">
            <span className="hp-step__dot">2</span>
            <div className="hp-step__card">
              <span className="hp-step__icon">
                <PaletteIcon />
              </span>
              <h3>Pick a layout and theme</h3>
              <p>Preview changes live. Reorder events, set density, lock what’s final.</p>
            </div>
          </li>
          <li className="hp-step">
            <div className="hp-step__card">
              <span className="hp-step__icon hp-step__icon--warm">
                <DownloadIcon />
              </span>
              <h3>Export or publish</h3>
              <p>Download PNG, JPG, or PDF — or share it in the public gallery.</p>
            </div>
            <span className="hp-step__dot hp-step__dot--warm">3</span>
          </li>
        </ol>
      </section>

      {/* ─── AI copilot ───────────────────────────────────────────────── */}
      <section className="hp-section hp-section--panel">
        <header className="hp-section__head">
          <span className="hp-kicker">
            <SparkIcon /> AI copilot
          </span>
          <h2 className="hp-section__title">AI proposes. You decide.</h2>
          <p className="hp-section__lead">
            Nothing the copilot suggests lands in your timeline until you accept it — and every
            proposed event shows where in your text it came from.
          </p>
        </header>

        <div className="hp-copilot">
          <div className="hp-copilot__notes">
            <p className="hp-copilot__label">Your notes</p>
            <p className="hp-copilot__text">
              We sketched the idea in <mark>January</mark>. By <mark>March</mark> the first
              prototype worked, and the public beta opened in <mark>June</mark>. Launch followed in{" "}
              <mark>September</mark>.
            </p>
          </div>

          <div className="hp-copilot__arrow" aria-hidden="true">
            <SparkIcon />
            <span>Extract events</span>
          </div>

          <ul className="hp-copilot__proposals" aria-label="Example proposals">
            <li className="hp-proposal">
              <span className="hp-proposal__date">Jan</span>
              <span className="hp-proposal__title">Idea sketched</span>
              <span className="hp-proposal__cite">from line 1</span>
              <span className="hp-proposal__state hp-proposal__state--ok">Accepted</span>
            </li>
            <li className="hp-proposal">
              <span className="hp-proposal__date">Mar</span>
              <span className="hp-proposal__title">First prototype</span>
              <span className="hp-proposal__cite">from line 1</span>
              <span className="hp-proposal__state hp-proposal__state--ok">Accepted</span>
            </li>
            <li className="hp-proposal hp-proposal--pending">
              <span className="hp-proposal__date">Jun</span>
              <span className="hp-proposal__title">Public beta</span>
              <span className="hp-proposal__cite">from line 2</span>
              <span className="hp-proposal__actions" aria-hidden="true">
                <span className="hp-proposal__accept">Accept</span>
                <span className="hp-proposal__reject">Reject</span>
              </span>
            </li>
            <li className="hp-proposal hp-proposal--flag">
              <span className="hp-proposal__date">Sep</span>
              <span className="hp-proposal__title">Launch</span>
              <span className="hp-proposal__cite">from line 2</span>
              <span className="hp-proposal__warn">
                <WarningIcon /> Year unclear — check before accepting
              </span>
            </li>
          </ul>
        </div>

        <ul className="hp-rules">
          <li>
            <span className="hp-rules__icon">
              <SparkIcon />
            </span>
            <strong>Three jobs</strong>
            <span>Extract events from text, rewrite one field, or suggest a visual direction.</span>
          </li>
          <li>
            <span className="hp-rules__icon">
              <LockIcon />
            </span>
            <strong>Lock anything</strong>
            <span>A locked event or title is off-limits to every AI rewrite.</span>
          </li>
          <li>
            <span className="hp-rules__icon">
              <UndoIcon />
            </span>
            <strong>Undo is always there</strong>
            <span>Changed your mind after accepting? One click puts it back.</span>
          </li>
        </ul>
      </section>

      {/* ─── Themes ───────────────────────────────────────────────────── */}
      <section className="hp-section">
        <header className="hp-section__head">
          <span className="hp-kicker">
            <PaletteIcon /> Themes
          </span>
          <h2 className="hp-section__title">Dress it for the room it’s shown in.</h2>
        </header>
        <div className="hp-themes">
          {THEME_PRESETS.map((theme) => (
            <figure
              key={theme.id}
              className={`hp-theme hp-theme--${theme.id}`}
              style={{
                ["--t-bg" as string]: theme.swatch[0],
                ["--t-surface" as string]: theme.swatch[1],
                ["--t-accent" as string]: theme.swatch[2],
                ["--t-ink" as string]: THEME_INK[theme.id] ?? "#1b1730",
              }}
            >
              <div className="hp-theme__stage" aria-hidden="true">
                <span className="hp-theme__title">Our first year</span>
                <span className="hp-theme__axis">
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} />
                  ))}
                </span>
                <span className="hp-theme__cards">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <figcaption>
                <strong>{theme.name}</strong>
                <span>{theme.description}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ─── Route map: guest vs signed in ────────────────────────────── */}
      <section className="hp-section">
        <header className="hp-section__head">
          <span className="hp-kicker">
            <GlobeIcon /> From draft to gallery
          </span>
          <h2 className="hp-section__title">Start as a guest. Sign in when you want more.</h2>
        </header>

        <div className="hp-route">
          <div className="hp-route__lane">
            <p className="hp-route__lane-label">As a guest</p>
            <ol className="hp-route__stops">
              <li>Create</li>
              <li>Export PNG · JPG · PDF</li>
              <li>Submit for review</li>
            </ol>
          </div>
          <div className="hp-route__lane hp-route__lane--signed">
            <p className="hp-route__lane-label">Signed in</p>
            <ol className="hp-route__stops">
              <li>Save to your dashboard</li>
              <li>Edit any time</li>
              <li>Publish</li>
            </ol>
          </div>
          <div className="hp-route__merge">
            <span className="hp-route__gate">
              <ShieldIcon />
              <strong>Moderation</strong>
              <span>An admin reviews it first</span>
            </span>
            <span className="hp-route__end">
              <GlobeIcon />
              <strong>Public gallery</strong>
            </span>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────── */}
      <section className="hp-cta">
        <div className="hp-cta__copy">
          <h2>Your first timeline is a few minutes away.</h2>
          <p>No account, no install — open the editor and start adding dates.</p>
        </div>
        <div className="hp-cta__actions">
          <Link href="/create" className="hp-btn hp-btn--light">
            Create a timeline <ArrowRightIcon />
          </Link>
          <Link href="/about-this-project" className="hp-btn hp-btn--outline-light">
            Behind this project
          </Link>
        </div>
      </section>
    </div>
  );
}
