"use client";

import { useEffect, useRef, type ReactNode, type MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslation } from "@asafarim/shared-i18n";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseNotice } from "@asafarim/ui";
import {
  ArrowRight,
  Clapperboard,
  CloudUpload,
  Download,
  FileAudio,
  Globe,
  ImagePlus,
  Layers,
  Mic,
  Play,
  Sparkles,
  Wand2,
  Zap,
  CheckCircle2,
  ScanFace,
} from "lucide-react";
import { ViontoNav } from "./ViontoNav";
import "./landing.css";

const viontoShowcase = getShowcaseProject("vionto")!;

/* ─── Hero studio mock ──────────────────────────────────────────────────────
   A stylised, animated preview of the pipeline (photos → script → voice →
   render). Purely decorative, so it is aria-hidden; the copy beside it
   carries the meaning. Animations live in landing.css and respect
   prefers-reduced-motion. */

const PHOTO_TILES = [
  "linear-gradient(135deg, #f9a26c, #f36f56 60%, #8b3a62)",
  "linear-gradient(160deg, #7dd3fc, #3b82f6 70%, #1e3a8a)",
  "linear-gradient(135deg, #fde68a, #e8b45d 55%, #b45309)",
  "linear-gradient(150deg, #a7f3d0, #59c3b1 60%, #0f766e)",
  "linear-gradient(135deg, #c4b5fd, #8b5cf6 60%, #4c1d95)",
  "linear-gradient(160deg, #fecdd3, #fb7185 60%, #9f1239)",
];

const WAVE_BARS = [4, 7, 5, 9, 6, 10, 8, 5, 9, 7, 4, 8, 10, 6, 9, 5, 7, 10, 6, 8, 4, 9, 7, 5, 8, 6, 10, 5, 7, 4];

function StageIcon({ icon: Icon, color }: { icon: React.ElementType; color: string }) {
  return (
    <span className="vl-stage__icon" style={{ background: `${color}1f`, color }}>
      <Icon size={13} />
    </span>
  );
}

function HeroStudio() {
  const { t } = useTranslation();
  return (
    <div className="vl-studio" aria-hidden="true">
      <div className="vl-float vl-float--tl">
        <ScanFace size={14} color="#8b5cf6" /> {t("vionto.landing.studio.floatScenes")}
      </div>

      <div className="vl-studio__card">
        <div className="vl-studio__body">
          <div className="vl-studio__bar">
            <div className="vl-studio__dots"><span /><span /><span /></div>
            <span className="vl-studio__title">{t("vionto.landing.studio.title")}</span>
            <span className="vl-studio__live">{t("vionto.landing.studio.live")}</span>
          </div>

          <div className="vl-studio__content">
            <div className="vl-stage">
              <div className="vl-stage__head">
                <StageIcon icon={ImagePlus} color="#f36f56" />
                {t("vionto.landing.how.step1.title")}
                <span className="vl-stage__meta">{t("vionto.landing.studio.photosMeta")}</span>
              </div>
              <div className="vl-photos">
                {PHOTO_TILES.map((bg, i) => (
                  <div
                    key={bg}
                    className="vl-photo"
                    style={{ background: bg, "--vl-delay": `${i * 0.18}s` } as React.CSSProperties}
                  />
                ))}
              </div>
            </div>

            <div className="vl-stage">
              <div className="vl-stage__head">
                <StageIcon icon={Wand2} color="#8b5cf6" />
                {t("vionto.landing.how.step2.title")}
                <span className="vl-stage__meta">GPT-4 · Claude</span>
              </div>
              <p className="vl-script">
                {t("vionto.landing.studio.scriptSample")}
                <span className="vl-caret" />
              </p>
            </div>

            <div className="vl-stage">
              <div className="vl-stage__head">
                <StageIcon icon={Mic} color="#59c3b1" />
                {t("vionto.landing.how.step3.title")}
                <span className="vl-stage__meta">{t("vionto.landing.studio.voiceMeta")}</span>
              </div>
              <div className="vl-wave">
                {WAVE_BARS.map((h, i) => (
                  <span
                    key={i}
                    style={{ maxHeight: `${h * 10}%`, animationDelay: `${(i % 10) * -0.13}s` }}
                  />
                ))}
              </div>
            </div>

            <div className="vl-stage">
              <div className="vl-stage__head">
                <StageIcon icon={Clapperboard} color="#e8b45d" />
                {t("vionto.landing.how.step4.title")}
                <span className="vl-stage__meta">MP4 · 1080p</span>
              </div>
              <div className="vl-progress"><div className="vl-progress__fill" /></div>
            </div>
          </div>
        </div>
      </div>

      <div className="vl-float vl-float--br">
        <CheckCircle2 size={14} color="#10b981" /> {t("vionto.landing.studio.floatReady")}
      </div>
    </div>
  );
}

/* ─── Small logo for footer ─────────────────────────────────────────────── */

function ViontoFooterMark() {
  return (
    <svg viewBox="0 0 36 36" fill="none" width="26" height="26" aria-hidden="true">
      <defs>
        <linearGradient id="lp-fg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#f36f56" />
          <stop offset="100%" stopColor="#e8b45d" />
        </linearGradient>
      </defs>
      <rect x="4" y="9" width="28" height="19" rx="3" stroke="url(#lp-fg)" strokeWidth="1.8" />
      <rect x="4"  y="11"   width="3" height="2.5" rx="0.5" fill="url(#lp-fg)" opacity="0.65" />
      <rect x="4"  y="15.5" width="3" height="2.5" rx="0.5" fill="url(#lp-fg)" opacity="0.65" />
      <rect x="29" y="11"   width="3" height="2.5" rx="0.5" fill="url(#lp-fg)" opacity="0.65" />
      <rect x="29" y="15.5" width="3" height="2.5" rx="0.5" fill="url(#lp-fg)" opacity="0.65" />
      <path d="M14 14.5 L14 22 M18 12 L18 24 M22 14.5 L22 22" stroke="url(#lp-fg)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Scroll-reveal wrapper ─────────────────────────────────────────────── */

function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = "0";
    el.style.transform = "translateY(30px)";
    el.style.transition = `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1";
          el.style.transform = "translateY(0)";
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);

  return <div ref={ref}>{children}</div>;
}

/* ─── Section pill label ────────────────────────────────────────────────── */

function SectionLabel({ children, color = "#f36f56", icon: Icon }: { children: ReactNode; color?: string; icon: React.ElementType }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        color,
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom: "18px",
      }}
    >
      <Icon size={11} />
      {children}
    </div>
  );
}

/* ─── Feature card ──────────────────────────────────────────────────────── */

function FeatureCard({
  icon: Icon,
  title,
  desc,
  accent = "#f36f56",
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "var(--landing-card-bg)",
        border: "1px solid var(--landing-card-border)",
        borderRadius: "18px",
        padding: "28px",
        backdropFilter: "blur(14px)",
        transition: "border-color 0.22s, transform 0.22s, box-shadow 0.22s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = `${accent}55`;
        el.style.transform = "translateY(-5px)";
        el.style.boxShadow = `0 18px 44px ${accent}1a`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "var(--landing-card-border)";
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          background: `${accent}1a`,
          border: `1px solid ${accent}35`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "18px",
        }}
      >
        <Icon size={21} color={accent} />
      </div>
      <h3 style={{ color: "var(--text)", fontWeight: 700, fontSize: "0.98rem", margin: "0 0 8px" }}>{title}</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.65, margin: 0 }}>{desc}</p>
    </div>
  );
}

/* ─── How-it-works step ─────────────────────────────────────────────────── */

const STEP_COLORS: Record<number, string> = { 1: "#f36f56", 2: "#e8b45d", 3: "#59c3b1", 4: "#6ea8ff" };

function Step({
  num, title, desc, icon: Icon, isLast = false,
}: {
  num: number; title: string; desc: string; icon: React.ElementType; isLast?: boolean;
}) {
  const accent = STEP_COLORS[num] ?? "#f36f56";
  return (
    <div style={{ display: "flex", gap: "18px", alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div
          style={{
            width: "50px",
            height: "50px",
            borderRadius: "50%",
            background: `${accent}18`,
            border: `2px solid ${accent}55`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: "1.05rem",
            color: accent,
          }}
        >
          {num}
        </div>
        {!isLast && (
          <div style={{ width: "1.5px", flex: 1, minHeight: "32px", background: "var(--landing-step-line)", marginTop: "8px" }} />
        )}
      </div>
      <div style={{ paddingTop: "10px", paddingBottom: isLast ? 0 : "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "8px" }}>
          <Icon size={16} color={accent} />
          <h3 style={{ color: "var(--text)", fontWeight: 700, fontSize: "1rem", margin: 0 }}>{title}</h3>
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.65, margin: 0 }}>{desc}</p>
      </div>
    </div>
  );
}

/* ─── Output mode card ──────────────────────────────────────────────────── */

function ModeCard({
  title, desc, ratio, ratioLabel, accent, badge,
}: {
  title: string; desc: string; ratio: string; ratioLabel: string; accent: string; badge: string;
}) {
  const [rw, rh] = ratio.split(":").map(Number);
  const isPortrait = rh > rw;
  const previewW = isPortrait ? 44 : 80;
  const previewH = isPortrait ? 80 : 48;

  return (
    <div
      style={{
        background: "var(--landing-card-bg)",
        border: `1px solid ${accent}30`,
        borderRadius: "20px",
        padding: "32px 28px",
        backdropFilter: "blur(14px)",
        transition: "border-color 0.22s, transform 0.22s, box-shadow 0.22s",
        display: "flex",
        flexDirection: "column",
        gap: "22px",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = `${accent}65`;
        el.style.transform = "translateY(-6px)";
        el.style.boxShadow = `0 22px 52px ${accent}1f`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = `${accent}30`;
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <div
          style={{
            width: `${previewW}px`,
            height: `${previewH}px`,
            borderRadius: "8px",
            background: `${accent}16`,
            border: `2px solid ${accent}50`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Play size={14} color={accent} />
        </div>
        <div>
          <span
            style={{
              display: "inline-block",
              fontSize: "0.68rem",
              fontWeight: 700,
              color: accent,
              background: `${accent}1a`,
              border: `1px solid ${accent}40`,
              borderRadius: "100px",
              padding: "3px 10px",
              letterSpacing: "0.07em",
              textTransform: "uppercase",
            }}
          >
            {badge}
          </span>
          <div style={{ marginTop: "7px", color: "var(--muted)", fontSize: "0.8rem" }}>{ratioLabel}</div>
        </div>
      </div>
      <div>
        <h3 style={{ color: "var(--text)", fontWeight: 700, fontSize: "1.1rem", margin: "0 0 8px" }}>{title}</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.65, margin: 0 }}>{desc}</p>
      </div>
    </div>
  );
}

/* ─── AI provider badge ─────────────────────────────────────────────────── */

function AIBadge({ name, role, color, initials }: { name: string; role: string; color: string; initials: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        background: "var(--landing-card-bg)",
        border: `1px solid ${color}30`,
        borderRadius: "16px",
        padding: "22px 24px",
        backdropFilter: "blur(14px)",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "12px",
          background: `${color}1a`,
          border: `1.5px solid ${color}45`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: "0.9rem",
          color,
          flexShrink: 0,
          letterSpacing: "-0.01em",
        }}
      >
        {initials}
      </div>
      <div>
        <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.95rem" }}>{name}</div>
        <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "3px" }}>{role}</div>
      </div>
    </div>
  );
}

/* ─── Main landing page ─────────────────────────────────────────────────── */

export function LandingPage() {
  const { status } = useSession();
  const { t } = useTranslation();
  const portalUrl = process.env.NEXT_PUBLIC_HUB_URL || "http://localhost:3001";

  const handleStartCreating = () => {
    if (status === "authenticated") {
      window.location.href = "/create";
    } else {
      window.location.href = `${portalUrl}/sign-in?callbackUrl=${encodeURIComponent(window.location.origin + "/create")}`;
    }
  };

  return (
    <div className="vi-landing">
      <div className="vl-backdrop" aria-hidden="true">
        <div className="vl-backdrop__aurora vl-backdrop__aurora--violet" />
        <div className="vl-backdrop__aurora vl-backdrop__aurora--coral" />
        <div className="vl-backdrop__aurora vl-backdrop__aurora--teal" />
        <div className="vl-backdrop__grid" />
      </div>

      <ViontoNav />

      <main>

        {/* ─── HERO ──────────────────────────────────────────────────────── */}
        <section className="vl-hero">
          <div className="vl-hero__inner">
            <div>
              <span className="vl-eyebrow">
                <span className="vl-eyebrow__tag">
                  <Sparkles size={10} /> AI
                </span>
                {t("vionto.landing.hero.badge")}
              </span>

              <h1 className="vl-title">
                {t("vionto.landing.hero.title.line2")}
                <br />
                <span className="vl-title__accent">{t("vionto.landing.hero.title.line3")}</span>
              </h1>

              <p className="vl-lead">{t("vionto.landing.hero.subtitle")}</p>

              <div className="vl-ctas">
                <button type="button" onClick={handleStartCreating} className="vl-btn vl-btn--primary">
                  {t("vionto.landing.hero.cta.start")} <ArrowRight size={16} />
                </button>
                <a href="#how-it-works" className="vl-btn vl-btn--ghost">
                  <Play size={14} /> {t("vionto.landing.hero.cta.how")}
                </a>
              </div>

              <div className="vl-trust">
                {[
                  { label: t("vionto.landing.trust.gptClaude"),     color: "#8b5cf6" },
                  { label: t("vionto.landing.trust.elevenlabs"),    color: "#59c3b1" },
                  { label: t("vionto.landing.trust.outputModes"),   color: "#e8b45d" },
                  { label: t("vionto.landing.trust.multiLanguage"), color: "#f36f56" },
                ].map(({ label, color }) => (
                  <span key={label} className="vl-trust__item">
                    <span className="vl-trust__dot" style={{ background: color }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <HeroStudio />
          </div>
        </section>

        {/* Honest positioning — copy is localized here, but the canonical
            English wording lives in the platform registry
            (@asafarim/auth/apps → showcase) so no app drifts on its own. */}
        <div className="vl-showcase">
          <ShowcaseNotice
            variant="compact"
            content={{
              label: t("vionto.landing.showcase.label"),
              summary: t("vionto.landing.showcase.summary"),
              aboutLabel: t("vionto.landing.showcase.about"),
              aboutHref: viontoShowcase.aboutHref,
            }}
            renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
          />
        </div>

        {/* ─── FEATURES ──────────────────────────────────────────────────── */}
        <section style={{ padding: "96px 24px", maxWidth: "1120px", margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: "64px" }}>
              <SectionLabel color="#e8b45d" icon={Zap}>{t("vionto.landing.features.label")}</SectionLabel>
              <h2
                style={{
                  fontSize: "clamp(1.9rem, 4vw, 3.1rem)",
                  fontWeight: 800,
                  color: "var(--text)",
                  margin: "0 0 16px",
                  letterSpacing: "-0.025em",
                }}
              >
                {t("vionto.landing.features.title")}
              </h2>
              <p style={{ color: "var(--muted)", maxWidth: "500px", margin: "0 auto", lineHeight: 1.7 }}>
                {t("vionto.landing.features.subtitle")}
              </p>
            </div>
          </Reveal>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "18px",
            }}
          >
            {[
              { icon: ImagePlus,    title: t("vionto.landing.features.imageUpload.title"),          desc: t("vionto.landing.features.imageUpload.desc"), accent: "#f36f56", delay: 0 },
              { icon: Wand2,        title: t("vionto.landing.features.aiScript.title"),  desc: t("vionto.landing.features.aiScript.desc"), accent: "#e8b45d", delay: 80 },
              { icon: Mic,          title: t("vionto.landing.features.voice.title"),       desc: t("vionto.landing.features.voice.desc"), accent: "#59c3b1", delay: 160 },
              { icon: Download,     title: t("vionto.landing.features.mp4Export.title"),            desc: t("vionto.landing.features.mp4Export.desc"), accent: "#6ea8ff", delay: 240 },
              { icon: Globe,        title: t("vionto.landing.features.multiLanguage.title"),        desc: t("vionto.landing.features.multiLanguage.desc"), accent: "#e8b45d", delay: 320 },
              { icon: Layers,       title: t("vionto.landing.features.modes.title"),        desc: t("vionto.landing.features.modes.desc"), accent: "#f36f56", delay: 400 },
            ].map(({ icon, title, desc, accent, delay }) => (
              <Reveal key={title} delay={delay}>
                <FeatureCard icon={icon} title={title} desc={desc} accent={accent} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* ─── HOW IT WORKS ──────────────────────────────────────────────── */}
        <section
          id="how-it-works"
          style={{
            padding: "96px 24px",
            background: "var(--landing-band-bg)",
            borderTop: "1px solid var(--landing-band-border)",
            borderBottom: "1px solid var(--landing-band-border)",
          }}
        >
          <div style={{ maxWidth: "960px", margin: "0 auto" }}>
            <Reveal>
              <div style={{ textAlign: "center", marginBottom: "64px" }}>
                <SectionLabel color="#59c3b1" icon={Zap}>{t("vionto.landing.how.label")}</SectionLabel>
                <h2
                  style={{
                    fontSize: "clamp(1.9rem, 4vw, 3.1rem)",
                    fontWeight: 800,
                    color: "var(--text)",
                    margin: "0 0 16px",
                    letterSpacing: "-0.025em",
                  }}
                >
                  {t("vionto.landing.how.title")}
                </h2>
                <p style={{ color: "var(--muted)", maxWidth: "460px", margin: "0 auto", lineHeight: 1.7 }}>
                  {t("vionto.landing.how.subtitle")}
                </p>
              </div>
            </Reveal>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: "0 80px",
              }}
            >
              <div>
                <Reveal delay={0}>
                  <Step num={1} icon={CloudUpload} title={t("vionto.landing.how.step1.title")} desc={t("vionto.landing.how.step1.desc")} />
                </Reveal>
                <Reveal delay={100}>
                  <Step num={2} icon={Wand2} title={t("vionto.landing.how.step2.title")} desc={t("vionto.landing.how.step2.desc")} />
                </Reveal>
              </div>
              <div>
                <Reveal delay={200}>
                  <Step num={3} icon={FileAudio} title={t("vionto.landing.how.step3.title")} desc={t("vionto.landing.how.step3.desc")} />
                </Reveal>
                <Reveal delay={300}>
                  <Step num={4} icon={Download} title={t("vionto.landing.how.step4.title")} desc={t("vionto.landing.how.step4.desc")} isLast />
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* ─── OUTPUT MODES ──────────────────────────────────────────────── */}
        <section style={{ padding: "96px 24px", maxWidth: "1120px", margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: "64px" }}>
              <SectionLabel color="#6ea8ff" icon={Clapperboard}>{t("vionto.landing.modes.label")}</SectionLabel>
              <h2
                style={{
                  fontSize: "clamp(1.9rem, 4vw, 3.1rem)",
                  fontWeight: 800,
                  color: "var(--text)",
                  margin: "0 0 16px",
                  letterSpacing: "-0.025em",
                }}
              >
                {t("vionto.landing.modes.title")}
              </h2>
              <p style={{ color: "var(--muted)", maxWidth: "460px", margin: "0 auto", lineHeight: 1.7 }}>
                {t("vionto.landing.modes.subtitle")}
              </p>
            </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
            <Reveal delay={0}>
              <ModeCard
                title={t("vionto.landing.modes.cinematic.title")}
                desc={t("vionto.landing.modes.cinematic.desc")}
                ratio="16:9" ratioLabel={t("vionto.landing.modes.cinematic.ratioLabel")} accent="#f36f56" badge={t("vionto.landing.modes.cinematic.badge")}
              />
            </Reveal>
            <Reveal delay={110}>
              <ModeCard
                title={t("vionto.landing.modes.slideshow.title")}
                desc={t("vionto.landing.modes.slideshow.desc")}
                ratio="16:9" ratioLabel={t("vionto.landing.modes.slideshow.ratioLabel")} accent="#e8b45d" badge={t("vionto.landing.modes.slideshow.badge")}
              />
            </Reveal>
            <Reveal delay={220}>
              <ModeCard
                title={t("vionto.landing.modes.social.title")}
                desc={t("vionto.landing.modes.social.desc")}
                ratio="9:16" ratioLabel={t("vionto.landing.modes.social.ratioLabel")} accent="#59c3b1" badge={t("vionto.landing.modes.social.badge")}
              />
            </Reveal>
          </div>
        </section>

        {/* ─── AI STACK ──────────────────────────────────────────────────── */}
        <section
          style={{
            padding: "96px 24px",
            background: "var(--landing-stack-bg)",
            borderTop: "1px solid var(--landing-band-border)",
            borderBottom: "1px solid var(--landing-band-border)",
          }}
        >
          <div style={{ maxWidth: "960px", margin: "0 auto" }}>
            <Reveal>
              <div style={{ textAlign: "center", marginBottom: "56px" }}>
                <SectionLabel color="#f36f56" icon={Sparkles}>{t("vionto.landing.stack.label")}</SectionLabel>
                <h2
                  style={{
                    fontSize: "clamp(1.9rem, 4vw, 3.1rem)",
                    fontWeight: 800,
                    color: "var(--text)",
                    margin: "0 0 16px",
                    letterSpacing: "-0.025em",
                  }}
                >
                  {t("vionto.landing.stack.title")}
                </h2>
                <p style={{ color: "var(--muted)", maxWidth: "460px", margin: "0 auto", lineHeight: 1.7 }}>
                  {t("vionto.landing.stack.subtitle")}
                </p>
              </div>
            </Reveal>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
              <Reveal delay={0}>
                <AIBadge name={t("vionto.landing.stack.gpt.name")} role={t("vionto.landing.stack.gpt.role")} color="#10a37f" initials="AI" />
              </Reveal>
              <Reveal delay={120}>
                <AIBadge name={t("vionto.landing.stack.claude.name")} role={t("vionto.landing.stack.claude.role")} color="#d97706" initials="Cl" />
              </Reveal>
              <Reveal delay={240}>
                <AIBadge name={t("vionto.landing.stack.elevenlabs.name")} role={t("vionto.landing.stack.elevenlabs.role")} color="#6ea8ff" initials="EL" />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ─── CTA ───────────────────────────────────────────────────────── */}
        <section
          style={{
            padding: "128px 24px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(ellipse 90% 70% at 50% 50%, rgba(243,111,86,0.09) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <Reveal>
            <h2
              style={{
                fontSize: "clamp(2.2rem, 5.5vw, 4.2rem)",
                fontWeight: 900,
                color: "var(--text)",
                letterSpacing: "-0.03em",
                margin: "0 0 20px",
                position: "relative",
                zIndex: 1,
              }}
            >
              {t("vionto.landing.cta.title")}
            </h2>
            <p
              style={{
                color: "var(--muted)",
                maxWidth: "420px",
                margin: "0 auto 48px",
                lineHeight: 1.7,
                fontSize: "1.06rem",
                position: "relative",
                zIndex: 1,
              }}
            >
              {t("vionto.landing.cta.subtitle")}
            </p>
            <Link
              href="/create"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "10px",
                background: "linear-gradient(135deg, #f36f56 0%, #e8b45d 100%)",
                color: "#101112",
                fontWeight: 800,
                fontSize: "1.06rem",
                padding: "17px 38px",
                borderRadius: "100px",
                textDecoration: "none",
                boxShadow: "0 14px 44px rgba(243,111,86,0.42)",
                transition: "opacity 0.2s, transform 0.2s, box-shadow 0.2s",
                position: "relative",
                zIndex: 1,
              }}
              onMouseEnter={(e: ReactMouseEvent<HTMLAnchorElement>) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.opacity = "0.92";
                el.style.transform = "translateY(-3px) scale(1.02)";
                el.style.boxShadow = "0 22px 58px rgba(243,111,86,0.52)";
              }}
              onMouseLeave={(e: ReactMouseEvent<HTMLAnchorElement>) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.opacity = "1";
                el.style.transform = "translateY(0) scale(1)";
                el.style.boxShadow = "0 14px 44px rgba(243,111,86,0.42)";
              }}
            >
              {t("vionto.landing.cta.button")} <ArrowRight size={18} />
            </Link>
          </Reveal>
        </section>

        {/* ─── FOOTER ────────────────────────────────────────────────────── */}
        <footer
          style={{
            borderTop: "1px solid var(--landing-footer-border)",
            padding: "36px 24px",
            maxWidth: "1120px",
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <ViontoFooterMark />
            <span style={{ fontWeight: 700, fontSize: "0.97rem", color: "var(--text)" }}>Vionto</span>
            <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{t("vionto.landing.footer.tagline")}</span>
          </div>
          <nav style={{ display: "flex", gap: "22px" }}>
            {[
              { href: "/privacy",        label: t("vionto.landing.footer.privacy") },
              { href: "/terms",          label: t("vionto.landing.footer.terms") },
              { href: "/acceptable-use", label: t("vionto.landing.footer.acceptableUse") },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                style={{ color: "var(--muted)", fontSize: "0.84rem", textDecoration: "none", transition: "color 0.18s" }}
                onMouseEnter={(e: ReactMouseEvent<HTMLAnchorElement>) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text)")}
                onMouseLeave={(e: ReactMouseEvent<HTMLAnchorElement>) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--muted)")}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
            © {new Date().getFullYear()} ASafariM Digital
          </div>
        </footer>
      </main>
    </div>
  );
}
