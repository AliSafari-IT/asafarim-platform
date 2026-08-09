"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
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

const showcase = getShowcaseProject("edumatch")!;

/**
 * Illustrative tutor profiles — invented for this showcase. EduMatch has no
 * real tutor supply, so these are always labelled as example data on screen;
 * never present them as a roster.
 */
const tutorCards = [
  { initials: "LM", name: "Lina M.", subject: "Mathematics · Secondary", rating: "4.9", mode: "Brussels · Online", color: "violet" },
  { initials: "YK", name: "Youssef K.", subject: "Physics · University", rating: "5.0", mode: "Online · French / EN", color: "mint" },
  { initials: "SN", name: "Sophie N.", subject: "Languages · All levels", rating: "4.8", mode: "Leuven · In person", color: "amber" },
];

function PrimaryActions() {
  const { data: session } = useSession();
  const roles = session?.user?.roles || [];
  const studentHref = session?.user ? "/student/inquiry/new" : `${portalUrl}/sign-in?callbackUrl=${encodeURIComponent(edumatchUrl + "/student/inquiry/new")}`;
  const tutorHref = session?.user ? "/tutor" : `${portalUrl}/sign-in?callbackUrl=${encodeURIComponent(edumatchUrl + "/tutor")}`;
  const primaryHref = roles.includes("edumatch_tutor") ? tutorHref : studentHref;
  const primaryLabel = roles.includes("edumatch_tutor") ? "Open tutor studio" : "Ask your first question";

  return (
    <div className="edu-hero-actions">
      <a className="edu-button edu-button-primary" href={primaryHref}>{primaryLabel}<ArrowRight size={17} /></a>
      <a className="edu-button edu-button-secondary" href={tutorHref}>Become a tutor</a>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="edu-landing">
      <section className="edu-hero">
        <div className="edu-hero-bg" aria-hidden="true" />
        <div className="edu-hero-glow edu-hero-glow-one" />
        <div className="edu-hero-glow edu-hero-glow-two" />
        <div className="edu-hero-copy">
          <div className="edu-eyebrow"><Sparkles size={15} /> Learning support, beautifully matched</div>
          <h1>Meet the right help.<br /><span>Make learning click.</span></h1>
          <p>From a difficult homework question to a trusted tutor who gets how you learn—EduMatch combines thoughtful AI guidance with real human expertise.</p>
          <PrimaryActions />
          <div className="edu-proof-row">
            <span><ShieldCheck size={17} /> Tutor verification workflow</span>
            <span><WandSparkles size={17} /> Explainable matching</span>
            <span><HeartHandshake size={17} /> Safe by design</span>
          </div>
          <ShowcaseNotice
            content={showcase}
            variant="compact"
            renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
          />
        </div>

        <div className="edu-hero-stage" aria-label="EduMatch product preview">
          <div className="edu-stage-orbit edu-stage-orbit-a" />
          <div className="edu-stage-orbit edu-stage-orbit-b" />
          <div className="edu-question-card">
            <div className="edu-question-top"><span><BrainCircuit size={18} /> Smart study companion</span><span className="edu-live-dot">Example</span></div>
            <div className="edu-question-prompt"><span>Physics · Year 11</span><strong>“Why does acceleration stay constant in this problem?”</strong></div>
            <div className="edu-ai-answer"><Sparkles size={18} /><div><strong>Let’s build the intuition first.</strong><p>The net force is unchanged, so by Newton’s second law the acceleration remains constant. Here’s a visual way to see it…</p></div></div>
            <div className="edu-question-footer"><span><Clock3 size={15} /> Answered in 12 sec</span><button type="button">Continue learning <ArrowRight size={14} /></button></div>
          </div>
          <div className="edu-match-card">
            <div className="edu-match-avatar">YK<span><BadgeCheck size={16} /></span></div>
            <div><span>Your top match</span><strong>Youssef K.</strong><small>Physics · 98% fit</small></div>
            <div className="edu-match-rating"><Star size={14} fill="currentColor" />5.0</div>
          </div>
          <div className="edu-session-chip"><Video size={17} /><span><strong>Next session</strong>Today · 17:30</span></div>
        </div>
      </section>

      <section className="edu-trust-strip">
        <p>Learning should feel possible</p>
        <div><span>Clear explanations</span><span>Fair matching</span><span>Flexible sessions</span><span>Trusted support</span></div>
      </section>

      <section className="edu-section edu-path-section">
        <div className="edu-section-heading">
          <span className="edu-kicker">One platform, two kinds of support</span>
          <h2>Start with what you need today.</h2>
          <p>Get immediate clarity, find an expert for deeper support, or move naturally between both.</p>
        </div>
        <div className="edu-path-grid">
          <article className="edu-path-card edu-path-ai">
            <div className="edu-path-icon"><BrainCircuit /></div>
            <span className="edu-path-number">01</span>
            <h3>Understand it now</h3>
            <p>Ask a question in your own words. EduMatch helps you reason through it step by step without simply handing over the answer.</p>
            <ul><li><Check size={15} /> Age-aware explanations</li><li><Check size={15} /> Study plans and practice</li><li><Check size={15} /> Academic integrity guardrails</li></ul>
            <Link href="/student/inquiry/new">Try the study companion <ArrowRight size={16} /></Link>
          </article>
          <article className="edu-path-card edu-path-human">
            <div className="edu-path-icon"><UsersRound /></div>
            <span className="edu-path-number">02</span>
            <h3>Find your person</h3>
            <p>Share your goal once. Our matching engine weighs subject, level, location, availability, trust, and learning preferences.</p>
            <ul><li><Check size={15} /> Explainable match scores</li><li><Check size={15} /> Verification-backed profiles</li><li><Check size={15} /> Online or nearby</li></ul>
            <Link href="/student/inquiry/new">Find a tutor <ArrowRight size={16} /></Link>
          </article>
          <article className="edu-path-card edu-path-grow">
            <div className="edu-path-icon"><GraduationCap /></div>
            <span className="edu-path-number">03</span>
            <h3>Grow with confidence</h3>
            <p>Compare transparent proposals, book securely, and keep every learning moment—from questions to sessions—in one calm space.</p>
            <ul><li><Check size={15} /> Clear quotes and scheduling</li><li><Check size={15} /> Secure booking flow</li><li><Check size={15} /> Your learning history</li></ul>
            <Link href="/student">Open your learning space <ArrowRight size={16} /></Link>
          </article>
        </div>
      </section>

      <section className="edu-section edu-tutors-section">
        <div className="edu-tutors-copy">
          <span className="edu-kicker">Matching with meaning</span>
          <h2>More than a directory of faces.</h2>
          <p>EduMatch shows why someone fits—not just who paid to appear first. Every recommendation is grounded in the learning need and practical constraints.</p>
          <div className="edu-match-factors">
            <div><BookOpen size={18} /><span><strong>Subject fit</strong>Expertise that matches the exact topic</span></div>
            <div><MapPin size={18} /><span><strong>Practical fit</strong>Location, mode, budget, availability</span></div>
            <div><ShieldCheck size={18} /><span><strong>Trust fit</strong>Verification and quality signals</span></div>
          </div>
          <Link className="edu-text-link" href="/student/inquiry/new">See how matching works <ArrowRight size={16} /></Link>
        </div>
        <div className="edu-tutor-stack">
          <div className="edu-stack-header"><span>Example recommendations</span><span>Illustrative profiles</span></div>
          {tutorCards.map((tutor, index) => (
            <div className="edu-tutor-card" key={tutor.name} style={{ "--delay": `${index * 80}ms` } as React.CSSProperties}>
              <span className={`edu-tutor-avatar ${tutor.color}`}>{tutor.initials}</span>
              <div><strong>{tutor.name} <BadgeCheck size={15} /></strong><span>{tutor.subject}</span><small><MapPin size={12} /> {tutor.mode}</small></div>
              <span className="edu-tutor-score"><Star size={13} fill="currentColor" />{tutor.rating}</span>
            </div>
          ))}
          <div className="edu-explain-pill"><WandSparkles size={16} /><span><strong>Why these matches?</strong>Subject, level, trust and availability align.</span></div>
        </div>
      </section>

      <section className="edu-section edu-safety-section">
        <div className="edu-safety-panel">
          <div><span className="edu-kicker">Trust is a product feature</span><h2>Built for the people learning—and the people helping.</h2></div>
          <div className="edu-safety-grid">
            <article><BadgeCheck /><h3>Verified expertise</h3><p>Structured tutor review, visible status, and an auditable verification trail.</p></article>
            <article><ShieldCheck /><h3>Safer learning</h3><p>Moderation and academic-integrity protections guide every AI-supported question.</p></article>
            <article><MessageCircleMore /><h3>Clear communication</h3><p>Notifications, proposals, booking updates, and support stay connected.</p></article>
            <article><CalendarCheck2 /><h3>Reliable sessions</h3><p>Transparent scheduling, cancellation, and dispute workflows, with a checkout flow that settles no real money.</p></article>
          </div>
        </div>
      </section>

      <section className="edu-cta-section">
        <div className="edu-cta-mark"><GraduationCap size={34} /></div>
        <span className="edu-kicker">Your next breakthrough can start here</span>
        <h2>A better match changes everything.</h2>
        <p>Bring the question. We’ll help you find the clearest next step.</p>
        <PrimaryActions />
      </section>
    </div>
  );
}
