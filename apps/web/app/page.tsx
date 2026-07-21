import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Syne, Space_Grotesk, Inter } from "next/font/google";
import { site } from "../content/site";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import webDictionaries from "../lib/i18n-dictionaries";
import { HomeEffects } from "./_home/HomeEffects";
import {
  ArrowUpRight,
  Bot,
  Briefcase,
  Building,
  CalendarClock,
  Check,
  Clock,
  Cpu,
  Github,
  Globe,
  Handshake,
  LayoutDashboard,
  Mail,
  MapPin,
  Package,
  Sparkles,
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
  title: site.title,
  description: site.description,
  alternates: { canonical: "/" },
};

const GITHUB = site.contact.github;
const EMAIL = site.contact.email;

const MARQUEE_ITEMS: { icon: string; label: string }[] = [
  { icon: "⚛️", label: "REACT" },
  { icon: "🔷", label: "TYPESCRIPT" },
  { icon: "▲", label: "NEXT.JS" },
  { icon: "🟢", label: "NODE.JS" },
  { icon: "◆", label: "PRISMA" },
  { icon: "🤖", label: "AI & AUTOMATION" },
  { icon: "🧠", label: "LLMS & RAG" },
  { icon: "🐳", label: "DOCKER" },
  { icon: "📦", label: "OPEN SOURCE" },
];

async function fetchNpmPackageCount(
  username: string,
  fallback = 34
): Promise<number> {
  try {
    const searchTerm = username.includes(".")
      ? username.split(".")[0]
      : username;
    const size = 250;
    let from = 0;
    let count = 0;
    let total = 0;

    do {
      const res = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(
          searchTerm
        )}&size=${size}&from=${from}`,
        { next: { revalidate: 86400 } }
      );
      if (!res.ok) return fallback;
      const data = (await res.json()) as {
        total: number;
        objects: {
          package: {
            publisher?: { username?: string };
            author?: { name?: string };
          };
        }[];
      };
      total = data.total;
      const matches = data.objects.filter(
        (obj) =>
          obj.package.publisher?.username === username ||
          obj.package.author?.name === username
      );
      count += matches.length;
      from += size;
    } while (from < total);

    return count > 0 ? count : fallback;
  } catch {
    return fallback;
  }
}

export default async function HomePage() {
  // Live count from npm search; falls back to 34 if the registry is unreachable.
  const openSourcePackageNr = await fetchNpmPackageCount("asafarim.be", 34);

  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, webDictionaries);

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
          <div className={styles.heroLeft}>
            <div className={styles.avail} data-reveal>
              <span className={styles.dot} />
              <span>{t("web.home.hero.eyebrow")}</span>
            </div>

            <h1 className={`${styles.display} ${styles.heroTitle}`}>
              <span data-reveal>{t("web.home.hero.title1")}</span>
              <span className={styles.stroke} data-reveal>
                {t("web.home.hero.title2")}
              </span>
              <span data-reveal>
                &amp;{" "}
                <em className={styles.accentGrad}>{t("web.home.hero.title3")}</em>
              </span>
            </h1>

            <p className={`${styles.lede} ${styles.grotesk}`} data-reveal>
              {t("web.home.hero.lede")}
            </p>

            <div className={styles.ctaRow} data-reveal>
              <a href="#hire" className={styles.btnPrimary}>
                {t("web.home.hero.ctaPrimary")} <Handshake size={16} />
              </a>
              <a href={GITHUB} target="_blank" rel="noreferrer" className={styles.btnGhost}>
                <Github size={16} /> {t("web.home.hero.ctaSecondary")}
              </a>
            </div>
          </div>

          {/* Current-focus card — surfaces the AI role and fills the hero's right column. */}
          <aside className={styles.heroCard} data-reveal data-tilt>
            <div className={styles.heroCardTop}>
              <span className={styles.heroCardNow}>
                <Sparkles size={14} /> {t("web.home.heroCard.now")}
              </span>
              <span className={styles.heroCardYear}>2026 &rarr;</span>
            </div>
            <h2 className={styles.heroCardRole}>{t("web.home.heroCard.role")}</h2>
            <p className={styles.heroCardOrg}>
              <Building size={15} /> {t("web.home.heroCard.org")}
              <span className={styles.heroCardDot} />
              <MapPin size={15} /> {t("web.home.heroCard.location")}
            </p>
            <p className={styles.heroCardDesc}>
              {t("web.home.heroCard.desc")}
            </p>
            <div className={styles.heroChips}>
              {["LLMs", "RAG", "Automation", "Next.js", "Node.js"].map((chip) => (
                <span key={chip} className={styles.heroChip}>
                  {chip}
                </span>
              ))}
            </div>
            <div className={styles.heroCardProjects}>
              <a
                href="https://immostory.ai"
                target="_blank"
                rel="noreferrer"
                className={styles.heroProject}
              >
                <span>
                  <strong>immostory.ai</strong> — {t("web.home.heroCard.projectImmo")}
                </span>
                <ArrowUpRight size={14} />
              </a>
              <a href="/projects" className={styles.heroProject}>
                <span>
                  <strong>Vionto</strong> — {t("web.home.heroCard.projectVionto")}
                </span>
                <ArrowUpRight size={14} />
              </a>
            </div>
          </aside>
        </div>
      </section>

      {/* ── Marquee ──────────────────────────────────────────── */}
      <div className={styles.marqueeWrap}>
        <div className={styles.marquee}>
          {[false, true].map((hidden) => (
            <span key={hidden ? "dup" : "main"} aria-hidden={hidden || undefined}>
              {MARQUEE_ITEMS.map(({ icon, label }, i) => (
                <span key={i} className={styles.marqueeItem}>
                  <span aria-hidden="true">{icon}</span> {label}
                  {i < MARQUEE_ITEMS.length - 1 ? <span> ✦ </span> : <span>&nbsp;✦&nbsp;</span>}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className={styles.stats}>
        {[
          { n: 7, s: "+", label: t("web.home.stats.yearsCoding"), cls: styles.accent },
          { n: 100, s: "+", label: t("web.home.stats.githubRepos"), cls: "" },
          { n: 100, s: "%", label: t("web.home.stats.freeOpen"), cls: styles.accentSky },
          { n: openSourcePackageNr, s: "+", label: t("web.home.stats.openSourcePackages"), cls: styles.accent },
          { n: 4, s: "", label: t("web.home.stats.livePlatforms"), cls: styles.accentBlush },
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
            <span className={styles.kicker}>{t("web.home.about.kicker")}</span>
            <h2 className={`${styles.display} ${styles.h2}`}>
              {t("web.home.about.heading1")}
              <br />
              <span className={styles.strokeGrape}>{t("web.home.about.heading2")}</span>
            </h2>
          </div>
          <div className={styles.prose} data-reveal>
            <p>
              {t("web.home.about.body1")}
            </p>
            <p>
              {t("web.home.about.body2")}
            </p>
            <p>
              {t("web.home.about.body3")}
            </p>
          </div>
        </div>
      </section>

      {/* ── Open source ──────────────────────────────────────── */}
      <section id="work" className={styles.section}>
        <div className={styles.aboutGrid} style={{ marginBottom: "3rem" }} data-reveal>
          <h2 className={`${styles.display} ${styles.h2}`}>
            {t("web.home.openSource.heading1")}<br />
            <span className={styles.strokeBlush}>{t("web.home.openSource.heading2")}</span>
          </h2>
          <p className={styles.prose} style={{ alignSelf: "end" }}>
            <span>
              {t("web.home.openSource.body")}
            </span>
          </p>
        </div>

        <div className={styles.workGrid}>
          <article className={`${styles.card} ${styles.span4} ${styles.tilt}`} data-reveal data-tilt>
            <Package size={36} className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>{t("web.home.workCard.packages.title")}</h3>
            <p className={styles.cardText}>
              {t("web.home.workCard.packages.text")}
            </p>
            <span className={styles.cardTag}>
              {t("web.home.workCard.packages.tag")} <ArrowUpRight size={14} />
            </span>
          </article>
          <article className={`${styles.card} ${styles.span2} ${styles.tilt}`} data-reveal data-tilt>
            <Bot size={36} style={{ color: "var(--blush)" }} />
            <h3 className={styles.cardTitle}>{t("web.home.workCard.ai.title")}</h3>
            <p className={styles.cardText}>
              {t("web.home.workCard.ai.text")}
            </p>
            <span className={styles.cardTag} style={{ color: "var(--blush)" }}>
              {t("web.home.workCard.ai.tag")} <Cpu size={14} />
            </span>
          </article>
          <article className={`${styles.card} ${styles.span2} ${styles.tilt}`} data-reveal data-tilt>
            <LayoutDashboard size={36} style={{ color: "var(--sky)" }} />
            <h3 className={styles.cardTitle}>{t("web.home.workCard.web.title")}</h3>
            <p className={styles.cardText}>
              {t("web.home.workCard.web.text")}
            </p>
          </article>
          <article className={`${styles.card} ${styles.span4} ${styles.tilt}`} data-reveal data-tilt>
            <Terminal size={36} style={{ color: "var(--ink)" }} />
            <h3 className={styles.cardTitle}>{t("web.home.workCard.automation.title")}</h3>
            <p className={styles.cardText}>
              {t("web.home.workCard.automation.text")}
            </p>
          </article>
        </div>

        <div className={styles.centerLink} data-reveal>
          <a href={GITHUB} target="_blank" rel="noreferrer" className={styles.btnGhost}>
            <Github size={16} /> {t("web.home.openSource.cta")}
          </a>
        </div>
      </section>

      {/* ── Work with me ─────────────────────────────────────── */}
      <section id="hire" className={styles.section}>
        <div className={styles.hireHead} data-reveal>
          <span className={styles.kicker}>{t("web.home.hire.kicker")}</span>
          <h2 className={`${styles.display} ${styles.h2}`}>
            {t("web.home.hire.heading1")}
            <br />
            {t("web.home.hire.heading2")}
          </h2>
          <p className={styles.prose} style={{ marginTop: "1rem" }}>
            <span>
              {t("web.home.hire.body")}
            </span>
          </p>
        </div>

        <div className={styles.hireGrid}>
          <div className={styles.hireCard} data-reveal>
            <Briefcase size={32} className={styles.hireIcon} />
            <h3 className={styles.hireTitle}>{t("web.home.hire.employee.title")}</h3>
            <p className={styles.hireLabel}>{t("web.home.hire.employee.label")}</p>
            <ul className={styles.hireList}>
              <li>
                <Check size={16} /> {t("web.home.hire.employee.benefit1")}
              </li>
              <li>
                <Check size={16} /> {t("web.home.hire.employee.benefit2")}
              </li>
              <li>
                <Check size={16} /> {t("web.home.hire.employee.benefit3")}
              </li>
            </ul>
            <a href="#contact" className={styles.hireCta}>
              {t("web.home.hire.employee.cta")}
            </a>
          </div>

          <div className={`${styles.hireCard} ${styles.hireFeatured}`} data-reveal>
            <span className={styles.badgeFlex}>{t("web.home.hire.flexi.badge")}</span>
            <CalendarClock size={32} className={styles.hireIcon} />
            <h3 className={styles.hireTitle}>{t("web.home.hire.flexi.title")}</h3>
            <p className={styles.hireLabel}>{t("web.home.hire.flexi.label")}</p>
            <ul className={styles.hireList}>
              <li>
                <Check size={16} /> {t("web.home.hire.flexi.benefit1")}
              </li>
              <li>
                <Check size={16} /> {t("web.home.hire.flexi.benefit2")}
              </li>
              <li>
                <Check size={16} /> {t("web.home.hire.flexi.benefit3")}
              </li>
            </ul>
            <a href="#contact" className={`${styles.hireCta} ${styles.hireCtaSolid}`}>
              {t("web.home.hire.flexi.cta")}
            </a>
          </div>

          <div className={styles.hireCard} data-reveal>
            <Clock size={32} className={styles.hireIcon} />
            <h3 className={styles.hireTitle}>{t("web.home.hire.partTime.title")}</h3>
            <p className={styles.hireLabel}>{t("web.home.hire.partTime.label")}</p>
            <ul className={styles.hireList}>
              <li>
                <Check size={16} /> {t("web.home.hire.partTime.benefit1")}
              </li>
              <li>
                <Check size={16} /> {t("web.home.hire.partTime.benefit2")}
              </li>
              <li>
                <Check size={16} /> {t("web.home.hire.partTime.benefit3")}
              </li>
            </ul>
            <a href="#contact" className={styles.hireCta}>
              {t("web.home.hire.partTime.cta")}
            </a>
          </div>
        </div>
      </section>

      {/* ── Quote ────────────────────────────────────────────── */}
      <section className={styles.section}>
        <div className={styles.quote}>
          <p className={styles.quoteText} data-reveal>
            &ldquo;{t("web.home.quote")}&rdquo;
          </p>
          <div className={styles.quoteBy} data-reveal>
            <span className={styles.quoteAvatar} />
            <span>{t("web.home.quoteBy")}</span>
          </div>
        </div>
      </section>

      {/* ── Sites ────────────────────────────────────────────── */}
      <section id="sites" className={styles.section}>
        <div
          style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "2.5rem" }}
          data-reveal
        >
          <span className={styles.kicker}>{t("web.home.sites.kicker")}</span>
          <span style={{ height: 1, flex: 1, background: "var(--line)" }} />
        </div>
        <div className={styles.sitesGrid}>
          {[
            {
              href: "https://asafarim.com",
              icon: <Globe size={30} className={styles.accent} />,
              name: t("web.home.sites.asafarimCom.name"),
              desc: t("web.home.sites.asafarimCom.desc"),
            },
            {
              href: "https://asafarim.be",
              icon: <MapPin size={30} className={styles.accentBlush} />,
              name: t("web.home.sites.asafarimBe.name"),
              desc: t("web.home.sites.asafarimBe.desc"),
            },
            {
              href: GITHUB,
              icon: <Github size={30} className={styles.accentSky} />,
              name: t("web.home.sites.github.name"),
              desc: t("web.home.sites.github.desc"),
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
            {t("web.home.contact.heading1")}
            <br />
            {t("web.home.contact.heading2")}
          </h2>
          <p className={styles.ctaText}>
            {t("web.home.contact.body")}
          </p>
          <div className={styles.ctaRow2}>
            <a href={`mailto:${EMAIL}`} className={styles.ctaBtnSolid}>
              <Mail size={16} /> {t("web.home.contact.emailCta")}
            </a>
            <a href={GITHUB} target="_blank" rel="noreferrer" className={styles.ctaBtnOutline}>
              <Github size={16} /> {t("web.home.contact.githubCta")}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
