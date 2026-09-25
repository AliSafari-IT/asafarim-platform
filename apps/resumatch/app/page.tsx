import type { Metadata } from "next";
import Link from "next/link";
import { ShowcaseNotice } from "./components/ShowcaseNotice";
import { HeroIllustration } from "./components/landing/HeroIllustration";
import { RewriteDiff } from "./components/landing/RewriteDiff";
import { SecurityLayers } from "./components/landing/SecurityLayers";
import {
  ArrowRightIcon,
  DownloadIcon,
  KeyIcon,
  LinkIcon,
  LockIcon,
  ShieldAlertIcon,
  SparkIcon,
  TrashIcon,
  UploadIcon,
} from "./profile/icons";

export const metadata: Metadata = { title: "Overview" };

/** Circumference helper for the stat-tile rings. */
const C = (r: number) => 2 * Math.PI * r;

const CAN_CHANGE = ["Summary", "Headline", "Experience bullets", "Bullet order"];
const LOCKED = ["Employers", "Dates", "Degrees", "Skills you didn't list"];
const NO_FIELD = ["Age", "Nationality", "Gender"];

export default function ResuMatchOverviewPage() {
  return (
    <div className="lp">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero__copy">
          <span className="lp-eyebrow">
            <span className="lp-eyebrow__pulse" /> Building in the open
          </span>
          <h1 className="lp-hero__title">
            Your CV, <span className="lp-hero__accent">tailored</span> to one job.
          </h1>
          <p className="lp-hero__lead">
            Paste the URL of a job you want. ResuMatch reads it, rewrites your confirmed profile
            toward it with AI, and hands you a downloadable PDF — without ever inventing a fact
            about you.
          </p>
          <div className="lp-hero__ctas">
            <Link href="/profile" className="lp-btn lp-btn--primary">
              Build your profile <ArrowRightIcon />
            </Link>
            <a href="#how-it-works" className="lp-btn lp-btn--ghost">
              <span className="lp-btn__play" aria-hidden="true">
                ▶
              </span>
              See how it works
            </a>
          </div>
          <p className="lp-hero__note">
            <KeyIcon /> Sign in with your platform account — no new password.
          </p>
        </div>
        <div className="lp-hero__art">
          <HeroIllustration />
        </div>
      </section>

      <ShowcaseNotice />

      {/* ─── Numbers, drawn ───────────────────────────────────────────── */}
      <section className="lp-stats" aria-label="ResuMatch in three numbers">
        <div className="lp-stat">
          <svg viewBox="0 0 80 80" className="lp-stat__viz" aria-hidden="true">
            <circle cx="40" cy="40" r="32" className="lp-stat__track" />
            <circle
              cx="40"
              cy="40"
              r="32"
              className="lp-stat__arc"
              strokeDasharray={`${C(32)} ${C(32)}`}
              transform="rotate(-90 40 40)"
            />
            <text x="40" y="47" textAnchor="middle" className="lp-stat__viz-text">
              100%
            </text>
          </svg>
          <div>
            <strong className="lp-stat__num">0</strong>
            <span className="lp-stat__label">fabricated facts</span>
            <span className="lp-stat__sub">Every line traces back to your confirmed profile.</span>
          </div>
        </div>

        <div className="lp-stat">
          <svg viewBox="0 0 80 80" className="lp-stat__viz" aria-hidden="true">
            <circle cx="40" cy="40" r="32" className="lp-stat__target lp-stat__target--1" />
            <circle cx="40" cy="40" r="22" className="lp-stat__target lp-stat__target--2" />
            <circle cx="40" cy="40" r="12" className="lp-stat__target lp-stat__target--3" />
            <circle cx="40" cy="40" r="4" className="lp-stat__bull" />
          </svg>
          <div>
            <strong className="lp-stat__num">1</strong>
            <span className="lp-stat__label">job at a time</span>
            <span className="lp-stat__sub">On purpose — no mass-applying, no scraping at scale.</span>
          </div>
        </div>

        <div className="lp-stat">
          <svg viewBox="0 0 80 80" className="lp-stat__viz" aria-hidden="true">
            <circle cx="40" cy="40" r="32" className="lp-stat__track" />
            <circle
              cx="40"
              cy="40"
              r="32"
              className="lp-stat__arc lp-stat__arc--warm"
              strokeDasharray={`${C(32) * 0.7} ${C(32)}`}
              transform="rotate(-90 40 40)"
            />
            <text x="40" y="47" textAnchor="middle" className="lp-stat__viz-text">
              90d
            </text>
          </svg>
          <div>
            <strong className="lp-stat__num">90 days</strong>
            <span className="lp-stat__label">then auto-deleted</span>
            <span className="lp-stat__sub">Originals go automatically — or sooner, with one click.</span>
          </div>
        </div>
      </section>

      {/* ─── How it works: a track, not three cards ───────────────────── */}
      <section id="how-it-works" className="lp-section">
        <header className="lp-section__head">
          <span className="lp-kicker">How it works</span>
          <h2 className="lp-section__title">Three steps. Nothing hidden in between.</h2>
        </header>

        <ol className="lp-track">
          <li className="lp-track__step">
            <span className="lp-track__node">1</span>
            <div className="lp-mock lp-mock--upload">
              <UploadIcon />
              <span className="lp-mock__file">my-cv.pdf</span>
              <span className="lp-mock__bar">
                <span className="lp-mock__bar-fill" />
              </span>
              <span className="lp-mock__ok">✓ Malware scan passed</span>
            </div>
            <h3 className="lp-track__title">Upload your CV</h3>
            <p className="lp-track__body">
              Scanned first, then read into a profile you correct before anything else touches it.
            </p>
          </li>
          <li className="lp-track__step">
            <span className="lp-track__node">2</span>
            <div className="lp-mock lp-mock--url">
              <span className="lp-mock__input">
                <LinkIcon />
                <span className="lp-mock__typed">careers.example.com/frontend</span>
              </span>
              <span className="lp-mock__btn">Fetch job</span>
            </div>
            <h3 className="lp-track__title">Paste a job URL</h3>
            <p className="lp-track__body">
              The one job you actually want. Fetched directly — no job-board licensing, no bulk
              scraping.
            </p>
          </li>
          <li className="lp-track__step">
            <span className="lp-track__node">3</span>
            <div className="lp-mock lp-mock--pdf">
              <span className="lp-mock__doc">
                <span />
                <span />
                <span />
                <b>PDF</b>
              </span>
              <span className="lp-mock__btn lp-mock__btn--warm">
                <DownloadIcon /> Download
              </span>
            </div>
            <h3 className="lp-track__title">Download the tailored PDF</h3>
            <p className="lp-track__body">
              AI rewords and reprioritizes your confirmed profile toward that job. Print-ready.
            </p>
          </li>
        </ol>
      </section>

      {/* ─── The rewrite, visualised ──────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <header className="lp-section__head">
          <span className="lp-kicker">
            <SparkIcon /> What tailoring does
          </span>
          <h2 className="lp-section__title">Reordered and reworded. Never invented.</h2>
          <p className="lp-section__lead">
            Follow the lines: every bullet on the right comes from one on the left.
          </p>
        </header>
        <RewriteDiff />

        <div className="lp-zones">
          <div className="lp-zone lp-zone--can">
            <p className="lp-zone__title">
              <SparkIcon /> AI may reword
            </p>
            <ul className="lp-zone__pills">
              {CAN_CHANGE.map((item) => (
                <li key={item} className="lp-pill lp-pill--can">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-zone lp-zone--locked">
            <p className="lp-zone__title">
              <LockIcon /> Locked — never changed
            </p>
            <ul className="lp-zone__pills">
              {LOCKED.map((item) => (
                <li key={item} className="lp-pill lp-pill--locked">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-zone lp-zone--none">
            <p className="lp-zone__title">∅ No field exists</p>
            <ul className="lp-zone__pills">
              {NO_FIELD.map((item) => (
                <li key={item} className="lp-pill lp-pill--none">
                  {item}
                </li>
              ))}
            </ul>
            <p className="lp-zone__note">Nothing to store, so nothing to infer.</p>
          </div>
        </div>
      </section>

      {/* ─── Your CV's lifecycle ──────────────────────────────────────── */}
      <section className="lp-section">
        <header className="lp-section__head">
          <span className="lp-kicker">Your CV’s journey</span>
          <h2 className="lp-section__title">From upload to gone, every stop is visible.</h2>
        </header>

        <ol className="lp-flow">
          <li className="lp-flow__stop">
            <span className="lp-flow__icon">
              <UploadIcon />
            </span>
            <strong>Upload</strong>
            <span>PDF, DOCX, or TXT</span>
          </li>
          <li className="lp-flow__stop lp-flow__stop--gate">
            <span className="lp-flow__icon">
              <ShieldAlertIcon />
            </span>
            <strong>Malware scan</strong>
            <span>Nothing opens it first</span>
            <em className="lp-flow__branch">No answer? → quarantined, never processed</em>
          </li>
          <li className="lp-flow__stop">
            <span className="lp-flow__icon">
              <KeyIcon />
            </span>
            <strong>You confirm</strong>
            <span>Your profile, not a parser’s guess</span>
          </li>
          <li className="lp-flow__stop">
            <span className="lp-flow__icon">
              <SparkIcon />
            </span>
            <strong>Tailored</strong>
            <span>Toward one job</span>
          </li>
          <li className="lp-flow__stop lp-flow__stop--end">
            <span className="lp-flow__icon">
              <DownloadIcon />
            </span>
            <strong>Your PDF</strong>
            <span>Review, then use</span>
          </li>
        </ol>

        <div className="lp-retention" role="img" aria-label="Retention: originals are deleted automatically after 90 days, and you can delete everything at any time before that.">
          <div className="lp-retention__bar">
            <span className="lp-retention__fill" />
            <span className="lp-retention__marker" style={{ left: "38%" }}>
              <TrashIcon />
              <em>Delete everything — one click, any day</em>
            </span>
          </div>
          <div className="lp-retention__scale">
            <span>Day 0 · upload</span>
            <span>Day 30</span>
            <span>Day 60</span>
            <span className="lp-retention__end">Day 90 · auto-deleted</span>
          </div>
          <p className="lp-retention__note">
            One click removes your file, every profile version, every fetched job page, and every
            tailored CV.
          </p>
        </div>
      </section>

      {/* ─── Security layers ──────────────────────────────────────────── */}
      <section className="lp-section lp-section--split">
        <header className="lp-section__head">
          <span className="lp-kicker">
            <LockIcon /> Built to be trusted
          </span>
          <h2 className="lp-section__title">Four walls around your CV.</h2>
          <p className="lp-section__lead">
            A request passes every ring before it reaches your data. Pick a layer to see what it
            does.
          </p>
        </header>
        <SecurityLayers />
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-cta__copy">
          <h2>Ready to tailor your first CV?</h2>
          <p>Upload once, confirm your profile, and point it at the job you want.</p>
        </div>
        <Link href="/profile" className="lp-btn lp-btn--light">
          Build your profile <ArrowRightIcon />
        </Link>
      </section>
    </div>
  );
}
