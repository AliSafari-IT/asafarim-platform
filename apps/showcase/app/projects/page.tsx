import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Metric, PageHeader, Panel, Section, StatusBadge } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../lib/i18n-dictionaries";
import { getProjects, PLATFORM_ELEMENTS } from "./data";
import { ArchitectureDiagram } from "./_components/ArchitectureDiagram";
import { CoverageMatrix } from "./_components/CoverageMatrix";
import { StackChart, StatusChart } from "./_components/StackChart";
import styles from "./_components/analysis.module.css";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "How the ASafarIM showcase fits together: status and stack breakdowns, the shared platform elements each project builds on, and the architecture behind them.",
};

/**
 * The analytical view. The home page is the gallery — one card per project,
 * linking to its write-up and its live app. This page answers the different
 * question: what is all of this made of, and how do the pieces connect.
 */
export default async function ProjectsPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const projects = getProjects((key) => t(key as any));

  const deployed = projects.filter((project) => project.externalUrl);
  const distinctTech = new Set(projects.flatMap((project) => project.stack));
  const reuse =
    projects.reduce((total, project) => total + project.dependsOn.length, 0) / (projects.length || 1);

  return (
    <>
      <PageHeader
        kicker={t("showcase.projects.kicker")}
        kickerIndex="01"
        title={t("showcase.projects.title")}
        description="What the wall is made of — how each piece is built, which shared platform elements it stands on, and how those elements connect. Walk the gallery itself on the home page."
        actions={<Link href="/">← Walk the gallery</Link>}
      />

      <Section kicker="At a glance" kickerIndex="02" title="The wall in numbers">
        <div className="ui-grid">
          <Metric label="Projects" value={projects.length} hint="on the wall" />
          <Metric label="Deployed" value={deployed.length} hint="reachable right now" />
          <Metric label="Distinct technologies" value={distinctTech.size} hint="across every stack" />
          <Metric
            label="Shared elements per project"
            value={reuse.toFixed(1)}
            hint={`of ${PLATFORM_ELEMENTS.length} available`}
          />
        </div>

        <div className="ui-grid" style={{ marginTop: "var(--space-5)" }}>
          <Panel title="Status mix">
            <StatusChart projects={projects} />
          </Panel>
          <Panel title="Most-used technologies">
            <StackChart projects={projects} />
          </Panel>
        </div>
      </Section>

      <Section
        kicker="System"
        kickerIndex="03"
        title="How the pieces connect"
      >
        <ArchitectureDiagram projects={projects} />
      </Section>

      <Section kicker="Coverage" kickerIndex="04" title="Who builds on what">
        <CoverageMatrix projects={projects} />
      </Section>

      <Section kicker="Detail" kickerIndex="05" title="Project by project">
        {projects.map((project) => (
          <article key={project.slug} className={styles.projectRow}>
            <div className={styles.projectHead}>
              <div className={styles.projectTitleRow}>
                <h3 className={styles.projectTitle}>
                  <Link href={`/projects/${project.slug}`}>{project.title}</Link>
                </h3>
                <StatusBadge status={project.status} />
              </div>
              <p className={styles.projectSummary}>{project.summary}</p>
              <div className={styles.projectLinks}>
                <Link href={`/projects/${project.slug}`}>Details →</Link>
                {project.externalUrl ? (
                  <a href={project.externalUrl} target="_blank" rel="noreferrer">
                    Open live ↗
                  </a>
                ) : null}
              </div>
              <div className={styles.stackTags}>
                {project.stack.map((tech) => (
                  <span key={tech} className={styles.stackTag}>
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            <ul className={styles.highlights}>
              {project.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </article>
        ))}
      </Section>
    </>
  );
}
