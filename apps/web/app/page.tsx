import type { Metadata } from "next";
import { Syne, Space_Grotesk, Inter } from "next/font/google";
import { site } from "../content/site";
import { HomeEffects } from "./_home/HomeEffects";
import {
  ArrowUpRight,
  Bot,
  Briefcase,
  CalendarClock,
  Check,
  Clock,
  Github,
  Globe,
  Handshake,
  LayoutDashboard,
  Mail,
  MapPin,
  Package,
  Terminal,
} from "./_home/icons";
import styles from "./page.module.css";

const syne = Syne({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-syne" });
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-grotesk",
});
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Ali Safari — Full-stack Developer & Technical Coordinator",
  description:
    "Full-stack developer (React / TypeScript / .NET) and Technical Coordinator in Belgium. Open-source everything; available for Employee, Flexi-job, or Part-time collaboration.",
  alternates: { canonical: "/" },
};

const GITHUB = site.contact.github;
const EMAIL = site.contact.email;

export default function HomePage() {
  return (
    <div
      data-home-fullbleed
      className={`${styles.home} ${syne.variable} ${grotesk.variable} ${inter.variable}`}
    >
      <HomeEffects />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section id="top" className={styles.hero}>
        <div className={styles.blob + " " + styles.blob1} data-parallax="0.15" />
        <div className={styles.blob + " " + styles.blob2} data-parallax="-0.1" />
        <div className={styles.blob + " " + styles.blob3} data-parallax="0.05" />

        <div className={styles.heroInner}>
          <div className={styles.avail} data-reveal>
            <span className={styles.dot} />
            <span>Available for collaboration</span>
          </div>

          <h1 className={`${styles.display} ${styles.heroTitle}`}>
            <span data-reveal>FULL-STACK</span>
            <span className={styles.stroke} data-reveal>
              DEVELOPER
            </span>
            <span data-reveal>
              &amp; <em className={styles.accentGrad}>BUILDER.</em>
            </span>
          </h1>

          <div className={styles.heroBottom} data-reveal>
            <p className={`${styles.lede} ${styles.grotesk}`}>
              I&apos;m <strong>Ali Safari</strong>{" "}&mdash;{" "}a full-stack developer (React /
              TypeScript / .NET) and Technical Coordinator at Probex Belgium. I build AI-powered
              tools and ship open-source apps &amp; packages that are{" "}
              <span className={styles.accent}>free for everyone</span>.
            </p>
            <div className={styles.ctaRow}>
              <a href="#hire" className={styles.btnPrimary}>
                Work with me <Handshake size={16} />
              </a>
              <a href={GITHUB} target="_blank" rel="noreferrer" className={styles.btnGhost}>
                <Github size={16} /> See my work
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Marquee ──────────────────────────────────────────── */}
      <div className={styles.marqueeWrap}>
        <div className={styles.marquee}>
          <span>REACT ✦ TYPESCRIPT ✦ .NET ✦ NEXT.JS ✦ AI &amp; AUTOMATION ✦ OPEN SOURCE ✦&nbsp;</span>
          <span aria-hidden="true">
            REACT ✦ TYPESCRIPT ✦ .NET ✦ NEXT.JS ✦ AI &amp; AUTOMATION ✦ OPEN SOURCE ✦&nbsp;
          </span>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className={styles.stats}>
        {[
          { n: 10, s: "+", label: "Years coding", cls: styles.accent },
          { n: 40, s: "+", label: "Repositories", cls: "" },
          { n: 100, s: "%", label: "Free & open", cls: "" },
          { n: 3, s: "", label: "Live platforms", cls: styles.accentBlush },
        ].map((stat) => (
          <div key={stat.label} data-reveal>
            <div
              className={`${styles.statNum} ${stat.cls}`}
              data-count={stat.n}
              data-suffix={stat.s}
            >
              {stat.n}
              {stat.s}
            </div>
            <p className={styles.statLabel}>{stat.label}</p>
          </div>
        ))}
      </section>

      {/* ── About ────────────────────────────────────────────── */}
      <section id="about" className={styles.section}>
        <div className={styles.aboutGrid}>
          <div data-reveal>
            <span className={styles.kicker}>About me</span>
            <h2 className={`${styles.display} ${styles.h2}`}>
              I build software that
              <br />
              <span className={styles.strokeGrape}>does the boring work.</span>
            </h2>
          </div>
          <div className={styles.prose} data-reveal>
            <p>
              Based in Belgium, I work across the full stack — React &amp; TypeScript on the front,
              .NET on the back — with a strong focus on automation and AI-powered tooling.
            </p>
            <p>
              As Technical Coordinator at <strong>Probex Belgium</strong>, I bridge engineering and
              delivery: turning fuzzy requirements into shipped, maintainable systems.
            </p>
            <p>
              Everything I publish — apps, libraries, and packages — I release{" "}
              <span className={styles.accent}>free and open source</span>. My time and hands-on
              collaboration are what I offer professionally.
            </p>
          </div>
        </div>
      </section>

      {/* ── Open source ──────────────────────────────────────── */}
      <section id="work" className={styles.section}>
        <div className={styles.aboutGrid} style={{ marginBottom: "3rem" }} data-reveal>
          <h2 className={`${styles.display} ${styles.h2}`}>
            Free &amp;<br />
            <span className={styles.strokeBlush}>open source.</span>
          </h2>
          <p className={styles.prose} style={{ alignSelf: "end" }}>
            <span>
              A selection of things I&apos;ve built and given away. Use them, fork them, ship with
              them — no strings.
            </span>
          </p>
        </div>

        <div className={styles.workGrid}>
          <article className={`${styles.card} ${styles.span4} ${styles.tilt}`} data-reveal data-tilt>
            <Package size={36} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Reusable Packages</h3>
            <p className={styles.cardText}>
              Battle-tested React &amp; TypeScript libraries and .NET utilities, published for anyone
              to drop into their own projects.
            </p>
            <span className={styles.cardTag}>
              npm &amp; NuGet <ArrowUpRight size={14} />
            </span>
          </article>
          <article className={`${styles.card} ${styles.span2} ${styles.tilt}`} data-reveal data-tilt>
            <Bot size={36} style={{ color: "var(--blush)" }} />
            <h3 className={styles.cardTitle}>AI Tools</h3>
            <p className={styles.cardText}>
              AI-powered apps that automate repetitive work and speed up real workflows.
            </p>
          </article>
          <article className={`${styles.card} ${styles.span2} ${styles.tilt}`} data-reveal data-tilt>
            <LayoutDashboard size={36} style={{ color: "var(--sky)" }} />
            <h3 className={styles.cardTitle}>Web Apps</h3>
            <p className={styles.cardText}>
              Full-stack applications built with Next.js, React and .NET APIs.
            </p>
          </article>
          <article className={`${styles.card} ${styles.span4} ${styles.tilt}`} data-reveal data-tilt>
            <Terminal size={36} style={{ color: "var(--ink)" }} />
            <h3 className={styles.cardTitle}>Automation &amp; Scripts</h3>
            <p className={styles.cardText}>
              Tooling that removes manual steps from build, deploy and data pipelines — so teams ship
              faster.
            </p>
          </article>
        </div>

        <div className={styles.centerLink} data-reveal>
          <a href={GITHUB} target="_blank" rel="noreferrer" className={styles.btnGhost}>
            <Github size={16} /> Browse everything on GitHub
          </a>
        </div>
      </section>

      {/* ── Work with me ─────────────────────────────────────── */}
      <section id="hire" className={styles.section}>
        <div className={styles.hireHead} data-reveal>
          <span className={styles.kicker}>Work with me</span>
          <h2 className={`${styles.display} ${styles.h2}`}>
            My products are free.
            <br />
            My time isn&apos;t.
          </h2>
          <p className={styles.prose} style={{ marginTop: "1rem" }}>
            <span>
              I&apos;m open to joining projects and teams. Pick the arrangement that fits how you
              work.
            </span>
          </p>
        </div>

        <div className={styles.hireGrid}>
          <div className={styles.hireCard} data-reveal>
            <Briefcase size={32} className={styles.hireIcon} />
            <h3 className={styles.hireTitle}>Employee</h3>
            <p className={styles.hireLabel}>Full commitment</p>
            <ul className={styles.hireList}>
              <li>
                <Check size={16} /> Long-term role on your team
              </li>
              <li>
                <Check size={16} /> Full-stack ownership
              </li>
              <li>
                <Check size={16} /> Technical coordination
              </li>
            </ul>
            <a href="#contact" className={styles.hireCta}>
              Discuss a role
            </a>
          </div>

          <div className={`${styles.hireCard} ${styles.hireFeatured}`} data-reveal>
            <span className={styles.badgeFlex}>Flexible</span>
            <CalendarClock size={32} className={styles.hireIcon} />
            <h3 className={styles.hireTitle}>Flexi-job</h3>
            <p className={styles.hireLabel}>On-demand hours</p>
            <ul className={styles.hireList}>
              <li>
                <Check size={16} /> Belgian flexi arrangement
              </li>
              <li>
                <Check size={16} /> Scale up or down as needed
              </li>
              <li>
                <Check size={16} /> Fast, focused delivery
              </li>
            </ul>
            <a href="#contact" className={`${styles.hireCta} ${styles.hireCtaSolid}`}>
              Start flexi
            </a>
          </div>

          <div className={styles.hireCard} data-reveal>
            <Clock size={32} className={styles.hireIcon} />
            <h3 className={styles.hireTitle}>Part-time</h3>
            <p className={styles.hireLabel}>A few days a week</p>
            <ul className={styles.hireList}>
              <li>
                <Check size={16} /> Regular weekly hours
              </li>
              <li>
                <Check size={16} /> Ongoing collaboration
              </li>
              <li>
                <Check size={16} /> Great for product teams
              </li>
            </ul>
            <a href="#contact" className={styles.hireCta}>
              Go part-time
            </a>
          </div>
        </div>
      </section>

      {/* ── Quote ────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.quote}>
          <p className={styles.quoteText} data-reveal>
            &ldquo;I give away the <span className={styles.accent}>code</span>. What I bring to a team
            is <em className={styles.accentBlush}>judgement, speed, and follow-through.</em>&rdquo;
          </p>
          <div className={styles.quoteBy} data-reveal>
            <span className={styles.quoteAvatar} />
            <span>Ali Safari — Full-stack Developer, Belgium</span>
          </div>
        </div>
      </section>

      {/* ── Sites ────────────────────────────────────────────── */}
      <section id="sites" className={styles.section}>
        <div
          style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2.5rem" }}
          data-reveal
        >
          <span className={styles.kicker}>Around the web</span>
          <span style={{ height: 1, flex: 1, background: "var(--line)" }} />
        </div>
        <div className={styles.sitesGrid}>
          {[
            {
              href: "https://asafarim.com",
              icon: <Globe size={30} className={styles.accent} />,
              name: "asafarim.com",
              desc: "My main hub — projects, writing and everything I ship.",
            },
            {
              href: "https://asafarim.be",
              icon: <MapPin size={30} className={styles.accentBlush} />,
              name: "asafarim.be",
              desc: "My Belgian presence — work, availability and local projects.",
            },
            {
              href: GITHUB,
              icon: <Github size={30} className={styles.accentSky} />,
              name: "AliSafari-IT",
              desc: "All my open-source code, packages and experiments.",
            },
          ].map((s) => (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className={`${styles.siteCard} ${styles.tilt}`}
              data-reveal
              data-tilt
            >
              <div className={styles.siteTop}>
                {s.icon}
                <ArrowUpRight size={20} className={styles.siteArrow} />
              </div>
              <h3 className={styles.siteName}>{s.name}</h3>
              <p className={styles.siteDesc}>{s.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* ── Contact CTA ──────────────────────────────────────── */}
      <section id="contact" className={styles.section}>
        <div className={styles.cta} data-reveal>
          <div className={styles.ctaDots} />
          <h2 className={styles.ctaTitle}>
            Let&apos;s build
            <br />
            something together.
          </h2>
          <p className={styles.ctaText}>
            Have a role, a project, or an idea? Tell me what you need and how you&apos;d like to work.
          </p>
          <div className={styles.ctaRow2}>
            <a href={`mailto:${EMAIL}`} className={styles.ctaBtnSolid}>
              <Mail size={16} /> Email me
            </a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className={styles.ctaBtnOutline}>
              <Github size={16} /> GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
