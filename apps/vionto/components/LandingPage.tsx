"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
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
} from "lucide-react";
import { ViontoNav } from "./ViontoNav";

/* ─── CSS Keyframe animations ───────────────────────────────────────────── */

const KEYFRAMES = `
@keyframes lp-float {
  0%, 100% { transform: translateY(0px); }
  50%       { transform: translateY(-14px); }
}
@keyframes lp-glow-pulse {
  0%, 100% { filter: drop-shadow(0 0 18px rgba(243,111,86,0.45)) drop-shadow(0 0 45px rgba(232,180,93,0.2)); }
  50%       { filter: drop-shadow(0 0 32px rgba(243,111,86,0.75)) drop-shadow(0 0 70px rgba(232,180,93,0.38)); }
}
@keyframes lp-orb-a {
  0%, 100% { transform: translate(0,0) scale(1); }
  35%       { transform: translate(45px,-30px) scale(1.06); }
  68%       { transform: translate(-22px,18px) scale(0.96); }
}
@keyframes lp-orb-b {
  0%, 100% { transform: translate(0,0) scale(1); }
  42%       { transform: translate(-55px,22px) scale(1.04); }
  75%       { transform: translate(28px,-16px) scale(0.97); }
}
@keyframes lp-shimmer {
  0%   { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes lp-dash-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes lp-dash-spin-rev {
  from { transform: rotate(0deg); }
  to   { transform: rotate(-360deg); }
}
`;

/* ─── Hero logo mark (220 × 220) ────────────────────────────────────────── */

function ViontoHeroMark() {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      width="220"
      height="220"
      role="img"
      aria-label="Vionto"
      style={{
        animation: "lp-float 4.2s ease-in-out infinite, lp-glow-pulse 3s ease-in-out infinite",
        willChange: "transform, filter",
      }}
    >
      <defs>
        <linearGradient id="lp-hg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#f36f56" />
          <stop offset="55%"  stopColor="#e8b45d" />
          <stop offset="100%" stopColor="#59c3b1" />
        </linearGradient>
        <radialGradient id="lp-hbg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#f36f56" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#f36f56" stopOpacity="0" />
        </radialGradient>
        <filter id="lp-hf" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="lp-hf2" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Glow halo */}
      <circle cx="60" cy="60" r="58" fill="url(#lp-hbg)" />

      {/* Outer dashed orbit — counter-spin */}
      <g style={{ transformOrigin: "60px 60px", animation: "lp-dash-spin-rev 28s linear infinite" }}>
        <circle cx="60" cy="60" r="56" stroke="url(#lp-hg)" strokeWidth="0.6" strokeDasharray="5 7" opacity="0.3" />
      </g>
      {/* Inner dashed orbit — spin */}
      <g style={{ transformOrigin: "60px 60px", animation: "lp-dash-spin 20s linear infinite" }}>
        <circle cx="60" cy="60" r="44" stroke="url(#lp-hg)" strokeWidth="0.5" strokeDasharray="3 9" opacity="0.2" />
      </g>

      {/* Film frame */}
      <rect x="14" y="28" width="92" height="64" rx="8" stroke="url(#lp-hg)" strokeWidth="2.5" filter="url(#lp-hf)" />

      {/* Sprockets left */}
      {([32, 46, 60, 74] as number[]).map((y) => (
        <rect key={`sl-${y}`} x="14" y={y} width="8" height="8" rx="1.5" fill="url(#lp-hg)" opacity="0.88" />
      ))}
      {/* Sprockets right */}
      {([32, 46, 60, 74] as number[]).map((y) => (
        <rect key={`sr-${y}`} x="98" y={y} width="8" height="8" rx="1.5" fill="url(#lp-hg)" opacity="0.88" />
      ))}

      {/* Audio waveform bars */}
      <path d="M32 54 L32 66"  stroke="url(#lp-hg)" strokeWidth="5" strokeLinecap="round" filter="url(#lp-hf2)" />
      <path d="M44 44 L44 76"  stroke="url(#lp-hg)" strokeWidth="5" strokeLinecap="round" filter="url(#lp-hf2)" />
      <path d="M56 50 L56 70"  stroke="url(#lp-hg)" strokeWidth="5" strokeLinecap="round" filter="url(#lp-hf2)" />
      <path d="M68 38 L68 82"  stroke="url(#lp-hg)" strokeWidth="5" strokeLinecap="round" filter="url(#lp-hf2)" />
      <path d="M80 46 L80 74"  stroke="url(#lp-hg)" strokeWidth="5" strokeLinecap="round" filter="url(#lp-hf2)" />
      <path d="M92 54 L92 66"  stroke="url(#lp-hg)" strokeWidth="4" strokeLinecap="round" filter="url(#lp-hf2)" />
    </svg>
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
  const portalUrl = process.env.NEXT_PUBLIC_HUB_URL || "http://localhost:3001";

  const handleStartCreating = () => {
    if (status === "authenticated") {
      window.location.href = "/create";
    } else {
      window.location.href = `${portalUrl}/sign-in?callbackUrl=${encodeURIComponent(window.location.origin + "/create")}`;
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <ViontoNav />

      <main>

        {/* ─── HERO ──────────────────────────────────────────────────────── */}
        <section
          style={{
            position: "relative",
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "120px 24px 96px",
            overflow: "hidden",
          }}
        >
          {/* Atmospheric orbs */}
          {[
            { top: "8%",  left: "12%",  size: 520, color: "#f36f56", anim: "lp-orb-a 13s ease-in-out infinite" },
            { top: "50%", right: "8%",  size: 420, color: "#e8b45d", anim: "lp-orb-b 16s ease-in-out infinite" },
            { top: "38%", left: "38%",  size: 320, color: "#59c3b1", anim: "lp-orb-a 21s ease-in-out infinite reverse" },
          ].map(({ top, left, right, size, color, anim }, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                position: "absolute",
                top,
                left,
                right,
                width: `${size}px`,
                height: `${size}px`,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${color}14 0%, transparent 68%)`,
                animation: anim,
                pointerEvents: "none",
              }}
            />
          ))}

          {/* Big animated logo */}
          <div style={{ marginBottom: "28px", position: "relative", zIndex: 1 }}>
            <ViontoHeroMark />
          </div>

          {/* Badge pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 18px",
              borderRadius: "100px",
              background: "rgba(243,111,86,0.12)",
              border: "1px solid rgba(243,111,86,0.32)",
              color: "#f36f56",
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "30px",
              position: "relative",
              zIndex: 1,
            }}
          >
            <Sparkles size={11} />
            AI-Powered Video Creation
          </div>

          {/* Headline */}
          <h1
            style={{
              fontSize: "clamp(2.8rem, 7.5vw, 5.8rem)",
              fontWeight: 900,
              lineHeight: 1.06,
              letterSpacing: "-0.035em",
              margin: "0 0 26px",
              maxWidth: "820px",
              position: "relative",
              zIndex: 1,
            }}
          >
            <span
              style={{
                background: "linear-gradient(130deg, #f36f56 0%, #e8b45d 45%, #59c3b1 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
                backgroundSize: "200% auto",
                animation: "lp-shimmer 5s linear infinite",
              }}
            >
              Vionto
            </span>
            <br />
            <span style={{ color: "var(--text)" }}>Your photos.</span>{" "}
            <span style={{ color: "var(--muted)", fontWeight: 700 }}>Their story.</span>
          </h1>

          {/* Sub-headline */}
          <p
            style={{
              color: "var(--muted)",
              fontSize: "clamp(1rem, 2.5vw, 1.22rem)",
              maxWidth: "570px",
              lineHeight: 1.7,
              marginBottom: "48px",
              position: "relative",
              zIndex: 1,
            }}
          >
            Upload a collection of images, and Vionto's AI writes the script, adds
            natural voice narration, and exports a{" "}
            <span style={{ color: "var(--text)", fontWeight: 600 }}>polished MP4</span> — in minutes.
          </p>

          {/* CTA buttons */}
          <div
            style={{
              display: "flex",
              gap: "14px",
              flexWrap: "wrap",
              justifyContent: "center",
              marginBottom: "60px",
              position: "relative",
              zIndex: 1,
            }}
          >
            <button
              type="button"
              onClick={handleStartCreating}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "9px",
                background: "linear-gradient(135deg, #f36f56 0%, #e8b45d 100%)",
                color: "#101112",
                fontWeight: 800,
                fontSize: "0.96rem",
                padding: "15px 30px",
                borderRadius: "100px",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 10px 36px rgba(243,111,86,0.38)",
                transition: "opacity 0.2s, transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.opacity = "0.92";
                el.style.transform = "translateY(-2px)";
                el.style.boxShadow = "0 16px 48px rgba(243,111,86,0.5)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.opacity = "1";
                el.style.transform = "translateY(0)";
                el.style.boxShadow = "0 10px 36px rgba(243,111,86,0.38)";
              }}
            >
              Start Creating <ArrowRight size={16} />
            </button>
            <a
              href="#how-it-works"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "9px",
                background: "var(--landing-secondary-bg)",
                border: "1px solid var(--landing-secondary-border)",
                color: "var(--text)",
                fontWeight: 600,
                fontSize: "0.96rem",
                padding: "15px 30px",
                borderRadius: "100px",
                textDecoration: "none",
                transition: "border-color 0.2s, transform 0.2s",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = "var(--line-strong)";
                el.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.borderColor = "var(--landing-secondary-border)";
                el.style.transform = "translateY(0)";
              }}
            >
              <Play size={13} /> See how it works
            </a>
          </div>

          {/* Trust pills */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              justifyContent: "center",
              position: "relative",
              zIndex: 1,
            }}
          >
            {[
              { label: "GPT-4 + Claude",    accent: "#6ea8ff" },
              { label: "ElevenLabs TTS",    accent: "#59c3b1" },
              { label: "3 Output Modes",    accent: "#e8b45d" },
              { label: "Multi-Language",    accent: "#f36f56" },
              { label: "Cloud Storage",     accent: "#b5b0aa" },
            ].map(({ label, accent }) => (
              <span
                key={label}
                style={{
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  color: accent,
                  background: `${accent}12`,
                  border: `1px solid ${accent}2e`,
                  borderRadius: "100px",
                  padding: "6px 14px",
                }}
              >
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* ─── FEATURES ──────────────────────────────────────────────────── */}
        <section style={{ padding: "96px 24px", maxWidth: "1120px", margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: "64px" }}>
              <SectionLabel color="#e8b45d" icon={Zap}>Everything you need</SectionLabel>
              <h2
                style={{
                  fontSize: "clamp(1.9rem, 4vw, 3.1rem)",
                  fontWeight: 800,
                  color: "var(--text)",
                  margin: "0 0 16px",
                  letterSpacing: "-0.025em",
                }}
              >
                From photos to cinematic video
              </h2>
              <p style={{ color: "var(--muted)", maxWidth: "500px", margin: "0 auto", lineHeight: 1.7 }}>
                Vionto handles the entire pipeline — from image ingestion to AI
                narration to polished video export.
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
              { icon: ImagePlus,    title: "Image Upload",          desc: "Drag and drop your photo collection. Vionto handles ordering, cropping, and optimization automatically.", accent: "#f36f56", delay: 0 },
              { icon: Wand2,        title: "AI Script Generation",  desc: "GPT-4 and Claude collaborate to write compelling narration scripts tailored to your images and chosen tone.", accent: "#e8b45d", delay: 80 },
              { icon: Mic,          title: "Voice Narration",       desc: "ElevenLabs TTS brings your script to life with natural, expressive voice — in your language of choice.", accent: "#59c3b1", delay: 160 },
              { icon: Download,     title: "MP4 Export",            desc: "Export polished MP4 videos in 16:9, 9:16, or 1:1. Ready for YouTube, Instagram Reels, or personal archives.", accent: "#6ea8ff", delay: 240 },
              { icon: Globe,        title: "Multi-Language",        desc: "Generate scripts and narration in dozens of languages. Reach a global audience with your visual stories.", accent: "#e8b45d", delay: 320 },
              { icon: Layers,       title: "Multiple Modes",        desc: "Cinematic story, Slideshow presentation, or Social documentary — each with its own pacing and visual style.", accent: "#f36f56", delay: 400 },
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
                <SectionLabel color="#59c3b1" icon={Zap}>Simple process</SectionLabel>
                <h2
                  style={{
                    fontSize: "clamp(1.9rem, 4vw, 3.1rem)",
                    fontWeight: 800,
                    color: "var(--text)",
                    margin: "0 0 16px",
                    letterSpacing: "-0.025em",
                  }}
                >
                  Four steps to your video
                </h2>
                <p style={{ color: "var(--muted)", maxWidth: "460px", margin: "0 auto", lineHeight: 1.7 }}>
                  Vionto's AI pipeline takes you from a folder of images to a
                  shareable video in under five minutes.
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
                  <Step num={1} icon={CloudUpload} title="Upload Your Photos" desc="Select the images you want to turn into a video. Vionto reads context from each image to understand the visual narrative." />
                </Reveal>
                <Reveal delay={100}>
                  <Step num={2} icon={Wand2} title="AI Writes the Script" desc="Our AI analyzes your photos and generates a narration script matched to the mood, content, and your chosen output mode." />
                </Reveal>
              </div>
              <div>
                <Reveal delay={200}>
                  <Step num={3} icon={FileAudio} title="Add Voice Narration" desc="ElevenLabs TTS renders the script into natural, expressive speech. Pick your language and voice persona." />
                </Reveal>
                <Reveal delay={300}>
                  <Step num={4} icon={Download} title="Export & Share" desc="Download your finished MP4. Share to YouTube, Instagram Reels, or keep it as a cinematic personal memory." isLast />
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* ─── OUTPUT MODES ──────────────────────────────────────────────── */}
        <section style={{ padding: "96px 24px", maxWidth: "1120px", margin: "0 auto" }}>
          <Reveal>
            <div style={{ textAlign: "center", marginBottom: "64px" }}>
              <SectionLabel color="#6ea8ff" icon={Clapperboard}>Output modes</SectionLabel>
              <h2
                style={{
                  fontSize: "clamp(1.9rem, 4vw, 3.1rem)",
                  fontWeight: 800,
                  color: "var(--text)",
                  margin: "0 0 16px",
                  letterSpacing: "-0.025em",
                }}
              >
                Made for every platform
              </h2>
              <p style={{ color: "var(--muted)", maxWidth: "460px", margin: "0 auto", lineHeight: 1.7 }}>
                Three distinct styles. Three aspect ratios. One tool.
              </p>
            </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
            <Reveal delay={0}>
              <ModeCard
                title="Cinematic Story"
                desc="Narrative-driven videos with dramatic pacing, expressive voice-over, and cinematic transitions. Built for YouTube and Vimeo."
                ratio="16:9" ratioLabel="16:9 Landscape" accent="#f36f56" badge="Story"
              />
            </Reveal>
            <Reveal delay={110}>
              <ModeCard
                title="Slideshow"
                desc="Clean, structured presentations with clear captions and steady pacing. Perfect for portfolios, reports, and event recaps."
                ratio="16:9" ratioLabel="16:9 / 9:16 / 1:1" accent="#e8b45d" badge="Slideshow"
              />
            </Reveal>
            <Reveal delay={220}>
              <ModeCard
                title="Social Documentary"
                desc="Fast-paced, vertical-optimised clips with punchy narration crafted for Instagram Reels, TikTok, and Shorts."
                ratio="9:16" ratioLabel="9:16 Portrait" accent="#59c3b1" badge="Social"
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
                <SectionLabel color="#f36f56" icon={Sparkles}>Powered by</SectionLabel>
                <h2
                  style={{
                    fontSize: "clamp(1.9rem, 4vw, 3.1rem)",
                    fontWeight: 800,
                    color: "var(--text)",
                    margin: "0 0 16px",
                    letterSpacing: "-0.025em",
                  }}
                >
                  Best-in-class AI stack
                </h2>
                <p style={{ color: "var(--muted)", maxWidth: "460px", margin: "0 auto", lineHeight: 1.7 }}>
                  Three frontier AI systems working in concert to deliver scripts and
                  narration that feel genuinely human.
                </p>
              </div>
            </Reveal>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
              <Reveal delay={0}>
                <AIBadge name="OpenAI GPT-4.1-mini" role="Primary script generation & vision" color="#10a37f" initials="AI" />
              </Reveal>
              <Reveal delay={120}>
                <AIBadge name="Anthropic Claude Haiku" role="Contextual narration & scene editing" color="#d97706" initials="Cl" />
              </Reveal>
              <Reveal delay={240}>
                <AIBadge name="ElevenLabs TTS" role="Natural multi-language voice synthesis" color="#6ea8ff" initials="EL" />
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
              Ready to tell your story?
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
              Start with a handful of photos. Vionto handles the rest — script, voice, and video.
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
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.opacity = "0.92";
                el.style.transform = "translateY(-3px) scale(1.02)";
                el.style.boxShadow = "0 22px 58px rgba(243,111,86,0.52)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLAnchorElement;
                el.style.opacity = "1";
                el.style.transform = "translateY(0) scale(1)";
                el.style.boxShadow = "0 14px 44px rgba(243,111,86,0.42)";
              }}
            >
              Create your first video <ArrowRight size={18} />
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
            <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>— AI-Powered Video Creation</span>
          </div>
          <nav style={{ display: "flex", gap: "22px" }}>
            {[
              { href: "/privacy",        label: "Privacy" },
              { href: "/terms",          label: "Terms" },
              { href: "/acceptable-use", label: "Acceptable Use" },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                style={{ color: "var(--muted)", fontSize: "0.84rem", textDecoration: "none", transition: "color 0.18s" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--text)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--muted)")}
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
    </>
  );
}
