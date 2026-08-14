"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslation, toBaseLanguage } from "@asafarim/shared-i18n";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseNotice } from "@asafarim/ui";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  BrainCircuit,
  CalendarCheck2,
  Check,
  Clock3,
  GraduationCap,
  HeartHandshake,
  MapPin,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  Star,
  UsersRound,
  Video,
  WandSparkles,
} from "lucide-react";

const portalUrl = process.env.NEXT_PUBLIC_HUB_URL || "http://localhost:3001";
const edumatchUrl = process.env.NEXT_PUBLIC_EDUMATCH_URL || "http://localhost:3009";

/**
 * Illustrative tutor profiles — invented for this showcase. EduMatch has no
 * real tutor supply, so these are always labelled as example data on screen;
 * never present them as a roster.
 */
const tutorCards = [
  { initials: "LM", name: "Lina M.", subjectKey: "edumatch.landing.tutors.example.subject1", modeKey: "edumatch.landing.tutors.example.mode1", rating: "4.9", color: "violet" },
  { initials: "YK", name: "Youssef K.", subjectKey: "edumatch.landing.tutors.example.subject2", modeKey: "edumatch.landing.tutors.example.mode2", rating: "5.0", color: "mint" },
  { initials: "SN", name: "Sophie N.", subjectKey: "edumatch.landing.tutors.example.subject3", modeKey: "edumatch.landing.tutors.example.mode3", rating: "4.8", color: "amber" },
];

function PrimaryActions() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const roles = session?.user?.roles || [];
  const studentHref = session?.user ? "/student/learn" : `${portalUrl}/sign-in?callbackUrl=${encodeURIComponent(edumatchUrl + "/student/learn")}`;
  const tutorHref = session?.user ? "/tutor" : `${portalUrl}/sign-in?callbackUrl=${encodeURIComponent(edumatchUrl + "/tutor")}`;
  const primaryHref = roles.includes("edumatch_tutor") ? tutorHref : studentHref;
  const primaryLabel = roles.includes("edumatch_tutor")
    ? t("edumatch.landing.cta.openTutorStudio")
    : t("edumatch.landing.cta.askFirst");

  return (
    <div className="edu-hero-actions">
      <a className="edu-button edu-button-primary" href={primaryHref}>{primaryLabel}<ArrowRight size={17} /></a>
      <a className="edu-button edu-button-secondary" href={tutorHref}>{t("edumatch.landing.cta.becomeTutor")}</a>
    </div>
  );
}

export default function HomePage() {
  const { t, locale } = useTranslation();
  const showcase = getShowcaseProject("edumatch", toBaseLanguage(locale))!;

  return (
    <div className="edu-landing">
      <section className="edu-hero">
        <div className="edu-hero-bg" aria-hidden="true" />
        <div className="edu-hero-glow edu-hero-glow-one" />
        <div className="edu-hero-glow edu-hero-glow-two" />
        <div className="edu-hero-copy">
          <ShowcaseNotice
            content={showcase}
            variant="inline"
            className="edu-showcase-banner"
            renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
          />
          <div className="edu-eyebrow"><Sparkles size={15} /> {t("edumatch.landing.hero.eyebrow")}</div>
          <h1>{t("edumatch.landing.hero.title")}<br /><span>{t("edumatch.landing.hero.titleHighlight")}</span></h1>
          <p>{t("edumatch.landing.hero.subtitle")}</p>
        </div>

        <div className="edu-hero-art-space" aria-hidden="true" />

        <div className="edu-hero-stage" aria-label={t("edumatch.landing.hero.stageAria")}>
          <div className="edu-stage-orbit edu-stage-orbit-a" />
          <div className="edu-stage-orbit edu-stage-orbit-b" />
          <div className="edu-question-card">
            <div className="edu-question-top"><span><BrainCircuit size={18} /> {t("edumatch.landing.hero.smartCompanion")}</span><span className="edu-live-dot">{t("edumatch.landing.hero.example")}</span></div>
            <div className="edu-question-prompt"><span>{t("edumatch.landing.hero.questionSubject")}</span><strong>{t("edumatch.landing.hero.questionText")}</strong></div>
            <div className="edu-ai-answer"><Sparkles size={18} /><div><strong>{t("edumatch.landing.hero.aiAnswerTitle")}</strong><p>{t("edumatch.landing.hero.aiAnswerBody")}</p></div></div>
            <div className="edu-question-footer"><span><Clock3 size={15} /> {t("edumatch.landing.hero.answeredIn")}</span><button type="button">{t("edumatch.landing.hero.continueLearning")} <ArrowRight size={14} /></button></div>
          </div>
          <div className="edu-match-card">
            <div className="edu-match-avatar">YK<span><BadgeCheck size={16} /></span></div>
            <div><span>{t("edumatch.landing.hero.topMatch")}</span><strong>Youssef K.</strong><small>{t("edumatch.landing.hero.matchFit")}</small></div>
            <div className="edu-match-rating"><Star size={14} fill="currentColor" />5.0</div>
          </div>
          <div className="edu-session-chip"><Video size={17} /><span><strong>{t("edumatch.landing.hero.nextSession")}</strong>{t("edumatch.landing.hero.sessionTime")}</span></div>
        </div>

        <div className="edu-hero-support">
          <PrimaryActions />
          <div className="edu-proof-row">
            <span><ShieldCheck size={17} /> {t("edumatch.landing.hero.proof.verification")}</span>
            <span><WandSparkles size={17} /> {t("edumatch.landing.hero.proof.matching")}</span>
            <span><HeartHandshake size={17} /> {t("edumatch.landing.hero.proof.safe")}</span>
          </div>
        </div>
      </section>

      <section className="edu-trust-strip">
        <p>{t("edumatch.landing.trust.title")}</p>
        <div><span>{t("edumatch.landing.trust.clearExplanations")}</span><span>{t("edumatch.landing.trust.fairMatching")}</span><span>{t("edumatch.landing.trust.flexibleSessions")}</span><span>{t("edumatch.landing.trust.trustedSupport")}</span></div>
      </section>

      <section className="edu-section edu-path-section">
        <div className="edu-section-heading">
          <span className="edu-kicker">{t("edumatch.landing.path.kicker")}</span>
          <h2>{t("edumatch.landing.path.title")}</h2>
          <p>{t("edumatch.landing.path.subtitle")}</p>
        </div>
        <div className="edu-path-grid">
          <article className="edu-path-card edu-path-ai">
            <div className="edu-path-icon"><BrainCircuit /></div>
            <span className="edu-path-number">01</span>
            <h3>{t("edumatch.landing.path.ai.title")}</h3>
            <p>{t("edumatch.landing.path.ai.desc")}</p>
            <ul><li><Check size={15} /> {t("edumatch.landing.path.ai.feature1")}</li><li><Check size={15} /> {t("edumatch.landing.path.ai.feature2")}</li><li><Check size={15} /> {t("edumatch.landing.path.ai.feature3")}</li></ul>
            <Link href="/student/learn">{t("edumatch.landing.path.ai.cta")} <ArrowRight size={16} /></Link>
          </article>
          <article className="edu-path-card edu-path-human">
            <div className="edu-path-icon"><UsersRound /></div>
            <span className="edu-path-number">02</span>
            <h3>{t("edumatch.landing.path.human.title")}</h3>
            <p>{t("edumatch.landing.path.human.desc")}</p>
            <ul><li><Check size={15} /> {t("edumatch.landing.path.human.feature1")}</li><li><Check size={15} /> {t("edumatch.landing.path.human.feature2")}</li><li><Check size={15} /> {t("edumatch.landing.path.human.feature3")}</li></ul>
            <Link href="/student/learn">{t("edumatch.landing.path.human.cta")} <ArrowRight size={16} /></Link>
          </article>
          <article className="edu-path-card edu-path-grow">
            <div className="edu-path-icon"><GraduationCap /></div>
            <span className="edu-path-number">03</span>
            <h3>{t("edumatch.landing.path.grow.title")}</h3>
            <p>{t("edumatch.landing.path.grow.desc")}</p>
            <ul><li><Check size={15} /> {t("edumatch.landing.path.grow.feature1")}</li><li><Check size={15} /> {t("edumatch.landing.path.grow.feature2")}</li><li><Check size={15} /> {t("edumatch.landing.path.grow.feature3")}</li></ul>
            <Link href="/student">{t("edumatch.landing.path.grow.cta")} <ArrowRight size={16} /></Link>
          </article>
        </div>
      </section>

      <section className="edu-section edu-tutors-section">
        <div className="edu-tutors-copy">
          <span className="edu-kicker">{t("edumatch.landing.tutors.kicker")}</span>
          <h2>{t("edumatch.landing.tutors.title")}</h2>
          <p>{t("edumatch.landing.tutors.desc")}</p>
          <div className="edu-match-factors">
            <div><BookOpen size={18} /><span><strong>{t("edumatch.landing.tutors.factor.subject.title")}</strong>{t("edumatch.landing.tutors.factor.subject.desc")}</span></div>
            <div><MapPin size={18} /><span><strong>{t("edumatch.landing.tutors.factor.practical.title")}</strong>{t("edumatch.landing.tutors.factor.practical.desc")}</span></div>
            <div><ShieldCheck size={18} /><span><strong>{t("edumatch.landing.tutors.factor.trust.title")}</strong>{t("edumatch.landing.tutors.factor.trust.desc")}</span></div>
          </div>
          <Link className="edu-text-link" href="/student/learn">{t("edumatch.landing.tutors.howMatchingWorks")} <ArrowRight size={16} /></Link>
        </div>
        <div className="edu-tutor-stack">
          <div className="edu-stack-header"><span>{t("edumatch.landing.tutors.exampleHeader")}</span><span>{t("edumatch.landing.tutors.illustrativeProfiles")}</span></div>
          {tutorCards.map((tutor, index) => (
            <div className="edu-tutor-card" key={tutor.name} style={{ "--delay": `${index * 80}ms` } as React.CSSProperties}>
              <span className={`edu-tutor-avatar ${tutor.color}`}>{tutor.initials}</span>
              <div><strong>{tutor.name} <BadgeCheck size={15} /></strong><span>{t(tutor.subjectKey)}</span><small><MapPin size={12} /> {t(tutor.modeKey)}</small></div>
              <span className="edu-tutor-score"><Star size={13} fill="currentColor" />{tutor.rating}</span>
            </div>
          ))}
          <div className="edu-explain-pill"><WandSparkles size={16} /><span><strong>{t("edumatch.landing.tutors.whyTheseMatches")}</strong>{t("edumatch.landing.tutors.whyExplanation")}</span></div>
        </div>
      </section>

      <section className="edu-section edu-safety-section">
        <div className="edu-safety-panel">
          <div><span className="edu-kicker">{t("edumatch.landing.safety.kicker")}</span><h2>{t("edumatch.landing.safety.title")}</h2></div>
          <div className="edu-safety-grid">
            <article><BadgeCheck /><h3>{t("edumatch.landing.safety.verified.title")}</h3><p>{t("edumatch.landing.safety.verified.desc")}</p></article>
            <article><ShieldCheck /><h3>{t("edumatch.landing.safety.safer.title")}</h3><p>{t("edumatch.landing.safety.safer.desc")}</p></article>
            <article><MessageCircleMore /><h3>{t("edumatch.landing.safety.communication.title")}</h3><p>{t("edumatch.landing.safety.communication.desc")}</p></article>
            <article><CalendarCheck2 /><h3>{t("edumatch.landing.safety.reliable.title")}</h3><p>{t("edumatch.landing.safety.reliable.desc")}</p></article>
          </div>
        </div>
      </section>

      <section className="edu-cta-section">
        <div className="edu-cta-mark"><GraduationCap size={34} /></div>
        <span className="edu-kicker">{t("edumatch.landing.ctaFinal.kicker")}</span>
        <h2>{t("edumatch.landing.ctaFinal.title")}</h2>
        <p>{t("edumatch.landing.ctaFinal.subtitle")}</p>
        <PrimaryActions />
      </section>
    </div>
  );
}
