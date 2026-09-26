import type { Metadata } from "next";
import Link from "next/link";
import { getTranslator } from "../lib/i18n-server";
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

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.nav.overview") };
}

/** Circumference helper for the stat-tile rings. */
const C = (r: number) => 2 * Math.PI * r;

/** Pill keys (resumatch.landing.pill.<key>) for the three "what AI may
 *  touch" zones. */
const CAN_CHANGE = ["summary", "headline", "bullets", "order"];
const LOCKED = ["employers", "dates", "degrees", "unlistedSkills"];
const NO_FIELD = ["age", "nationality", "gender"];

export default async function ResuMatchOverviewPage() {
  const { t } = await getTranslator();
  return (
    <div className="lp">
      {/* ─── Hero ─────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero__copy">
          <span className="lp-eyebrow">
            <span className="lp-eyebrow__pulse" /> {t("resumatch.landing.eyebrow")}
          </span>
          <h1 className="lp-hero__title">
            {t("resumatch.landing.hero.before")}
            <span className="lp-hero__accent">{t("resumatch.landing.hero.accent")}</span>
            {t("resumatch.landing.hero.after")}
          </h1>
          <p className="lp-hero__lead">
            {t("resumatch.landing.hero.lead")}
          </p>
          <div className="lp-hero__ctas">
            <Link href="/profile" className="lp-btn lp-btn--primary">
              {t("resumatch.landing.cta.build")} <ArrowRightIcon />
            </Link>
            <a href="#how-it-works" className="lp-btn lp-btn--ghost">
              <span className="lp-btn__play" aria-hidden="true">
                ▶
              </span>
              {t("resumatch.landing.cta.how")}
            </a>
          </div>
          <p className="lp-hero__note">
            <KeyIcon /> {t("resumatch.landing.hero.note")}
          </p>
        </div>
        <div className="lp-hero__art">
          <HeroIllustration t={t} />
        </div>
      </section>

      <ShowcaseNotice />

      {/* ─── Numbers, drawn ───────────────────────────────────────────── */}
      <section className="lp-stats" aria-label={t("resumatch.landing.stats.aria")}>
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
            <span className="lp-stat__label">{t("resumatch.landing.stat1.label")}</span>
            <span className="lp-stat__sub">{t("resumatch.landing.stat1.sub")}</span>
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
            <span className="lp-stat__label">{t("resumatch.landing.stat2.label")}</span>
            <span className="lp-stat__sub">{t("resumatch.landing.stat2.sub")}</span>
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
              {t("resumatch.landing.stat3.viz")}
            </text>
          </svg>
          <div>
            <strong className="lp-stat__num">{t("resumatch.landing.stat3.num")}</strong>
            <span className="lp-stat__label">{t("resumatch.landing.stat3.label")}</span>
            <span className="lp-stat__sub">{t("resumatch.landing.stat3.sub")}</span>
          </div>
        </div>
      </section>

      {/* ─── How it works: a track, not three cards ───────────────────── */}
      <section id="how-it-works" className="lp-section">
        <header className="lp-section__head">
          <span className="lp-kicker">{t("resumatch.landing.how.kicker")}</span>
          <h2 className="lp-section__title">{t("resumatch.landing.how.title")}</h2>
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
              <span className="lp-mock__ok">{t("resumatch.landing.how.scanPassed")}</span>
            </div>
            <h3 className="lp-track__title">{t("resumatch.landing.how.step1.title")}</h3>
            <p className="lp-track__body">
              {t("resumatch.landing.how.step1.body")}
            </p>
          </li>
          <li className="lp-track__step">
            <span className="lp-track__node">2</span>
            <div className="lp-mock lp-mock--url">
              <span className="lp-mock__input">
                <LinkIcon />
                <span className="lp-mock__typed">careers.example.com/frontend</span>
              </span>
              <span className="lp-mock__btn">{t("resumatch.flow.fetch")}</span>
            </div>
            <h3 className="lp-track__title">{t("resumatch.landing.how.step2.title")}</h3>
            <p className="lp-track__body">
              {t("resumatch.landing.how.step2.body")}
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
                <DownloadIcon /> {t("resumatch.landing.how.download")}
              </span>
            </div>
            <h3 className="lp-track__title">{t("resumatch.landing.how.step3.title")}</h3>
            <p className="lp-track__body">
              {t("resumatch.landing.how.step3.body")}
            </p>
          </li>
        </ol>
      </section>

      {/* ─── The rewrite, visualised ──────────────────────────────────── */}
      <section className="lp-section lp-section--panel">
        <header className="lp-section__head">
          <span className="lp-kicker">
            <SparkIcon /> {t("resumatch.landing.rewrite.kicker")}
          </span>
          <h2 className="lp-section__title">{t("resumatch.landing.rewrite.title")}</h2>
          <p className="lp-section__lead">{t("resumatch.landing.rewrite.lead")}</p>
        </header>
        <RewriteDiff t={t} />

        <div className="lp-zones">
          <div className="lp-zone lp-zone--can">
            <p className="lp-zone__title">
              <SparkIcon /> {t("resumatch.landing.zone.can")}
            </p>
            <ul className="lp-zone__pills">
              {CAN_CHANGE.map((item) => (
                <li key={item} className="lp-pill lp-pill--can">
                  {t(`resumatch.landing.pill.${item}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-zone lp-zone--locked">
            <p className="lp-zone__title">
              <LockIcon /> {t("resumatch.landing.zone.locked")}
            </p>
            <ul className="lp-zone__pills">
              {LOCKED.map((item) => (
                <li key={item} className="lp-pill lp-pill--locked">
                  {t(`resumatch.landing.pill.${item}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="lp-zone lp-zone--none">
            <p className="lp-zone__title">∅ {t("resumatch.landing.zone.none")}</p>
            <ul className="lp-zone__pills">
              {NO_FIELD.map((item) => (
                <li key={item} className="lp-pill lp-pill--none">
                  {t(`resumatch.landing.pill.${item}`)}
                </li>
              ))}
            </ul>
            <p className="lp-zone__note">{t("resumatch.landing.zone.noneNote")}</p>
          </div>
        </div>
      </section>

      {/* ─── Your CV's lifecycle ──────────────────────────────────────── */}
      <section className="lp-section">
        <header className="lp-section__head">
          <span className="lp-kicker">{t("resumatch.landing.journey.kicker")}</span>
          <h2 className="lp-section__title">{t("resumatch.landing.journey.title")}</h2>
        </header>

        <ol className="lp-flow">
          <li className="lp-flow__stop">
            <span className="lp-flow__icon">
              <UploadIcon />
            </span>
            <strong>{t("resumatch.landing.journey.upload")}</strong>
            <span>{t("resumatch.landing.journey.uploadSub")}</span>
          </li>
          <li className="lp-flow__stop lp-flow__stop--gate">
            <span className="lp-flow__icon">
              <ShieldAlertIcon />
            </span>
            <strong>{t("resumatch.landing.journey.scan")}</strong>
            <span>{t("resumatch.landing.journey.scanSub")}</span>
            <em className="lp-flow__branch">{t("resumatch.landing.journey.scanBranch")}</em>
          </li>
          <li className="lp-flow__stop">
            <span className="lp-flow__icon">
              <KeyIcon />
            </span>
            <strong>{t("resumatch.landing.journey.confirm")}</strong>
            <span>{t("resumatch.landing.journey.confirmSub")}</span>
          </li>
          <li className="lp-flow__stop">
            <span className="lp-flow__icon">
              <SparkIcon />
            </span>
            <strong>{t("resumatch.landing.journey.tailored")}</strong>
            <span>{t("resumatch.landing.journey.tailoredSub")}</span>
          </li>
          <li className="lp-flow__stop lp-flow__stop--end">
            <span className="lp-flow__icon">
              <DownloadIcon />
            </span>
            <strong>{t("resumatch.landing.journey.pdf")}</strong>
            <span>{t("resumatch.landing.journey.pdfSub")}</span>
          </li>
        </ol>

        <div className="lp-retention" role="img" aria-label={t("resumatch.landing.retention.aria")}>
          <div className="lp-retention__bar">
            <span className="lp-retention__fill" />
            <span className="lp-retention__marker" style={{ left: "38%" }}>
              <TrashIcon />
              <em>{t("resumatch.landing.retention.marker")}</em>
            </span>
          </div>
          <div className="lp-retention__scale">
            <span>{t("resumatch.landing.retention.day0")}</span>
            <span>{t("resumatch.landing.retention.day", { n: 30 })}</span>
            <span>{t("resumatch.landing.retention.day", { n: 60 })}</span>
            <span className="lp-retention__end">{t("resumatch.landing.retention.day90")}</span>
          </div>
          <p className="lp-retention__note">{t("resumatch.landing.retention.note")}</p>
        </div>
      </section>

      {/* ─── Security layers ──────────────────────────────────────────── */}
      <section className="lp-section lp-section--split">
        <header className="lp-section__head">
          <span className="lp-kicker">
            <LockIcon /> {t("resumatch.landing.security.kicker")}
          </span>
          <h2 className="lp-section__title">{t("resumatch.landing.security.title")}</h2>
          <p className="lp-section__lead">{t("resumatch.landing.security.lead")}</p>
        </header>
        <SecurityLayers />
      </section>

      {/* ─── Final CTA ────────────────────────────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-cta__copy">
          <h2>{t("resumatch.landing.final.title")}</h2>
          <p>{t("resumatch.landing.final.body")}</p>
        </div>
        <Link href="/profile" className="lp-btn lp-btn--light">
          Build your profile <ArrowRightIcon />
        </Link>
      </section>
    </div>
  );
}
