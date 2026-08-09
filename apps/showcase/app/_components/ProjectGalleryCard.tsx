import Link from "next/link";
import { Badge, StatusBadge } from "@asafarim/ui";
import type { ShowcaseProject } from "../projects/data";
import styles from "./gallery.module.css";

/**
 * Gallery piece with TWO destinations: the details page and, when the project
 * is actually deployed, the running app.
 *
 * Deliberately not the shared `ProjectCard` — that component wraps the whole
 * card in a single <a>, and an anchor may not contain another anchor. Rather
 * than nest links (invalid HTML, and a mess for keyboard and screen-reader
 * users) the card body is plain markup and the two links sit in a footer as
 * peers.
 */
export function ProjectGalleryCard({ project }: { project: ShowcaseProject }) {
  const detailsHref = `/projects/${project.slug}`;
  const deployed = Boolean(project.externalUrl);

  return (
    <article className={styles.card}>
      <div className={styles.frame} aria-hidden="true">
        <span>{project.glyph}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.index}>№ {project.index}</span>
          <StatusBadge status={project.status} />
        </div>

        {/* The heading holds the details link, so the accessible name of the
            primary action is the project title rather than "Project details".
            The ::after overlay makes the whole card clickable without nesting
            the "Open live" anchor inside it. */}
        <h3 className={styles.title}>
          <Link href={detailsHref} className={styles.titleLink}>
            {project.title}
          </Link>
        </h3>

        <p className={styles.summary}>{project.summary}</p>

        <div className={styles.tags}>
          {project.tags.map((tag) => (
            <Badge key={tag} tone="info">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      <footer className={styles.actions}>
        <Link href={detailsHref} className={styles.actionPrimary}>
          Project details →
        </Link>
        {deployed ? (
          <a
            href={project.externalUrl}
            className={styles.actionLive}
            target="_blank"
            rel="noreferrer"
          >
            <span className={styles.liveDot} aria-hidden="true" />
            Open live ↗<span className={styles.srOnly}> — opens {project.title} in a new tab</span>
          </a>
        ) : (
          <span className={styles.actionDisabled}>Not deployed yet</span>
        )}
      </footer>
    </article>
  );
}
