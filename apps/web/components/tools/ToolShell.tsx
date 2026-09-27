import type { ReactNode } from "react";
import { PageHeader, getPlatformLinks } from "@asafarim/ui";
import type { ToolDefinition } from "../../lib/tools/types";
import { ToolLifecycleBadge } from "./ToolLifecycleBadge";
import styles from "./tools.module.css";

/**
 * The server-rendered frame every tool page uses. It owns the heading, the
 * AI-use and privacy disclosures next to the input, limitations next to the
 * result, and the "continue / how it was built" links after it. Tools supply
 * only the interactive workbench, so no tool can omit a required disclosure.
 */
export function ToolShell({ tool, children }: { tool: ToolDefinition; children: ReactNode }) {
  const links = getPlatformLinks();
  const relatedHref = tool.relatedApp ? links[tool.relatedApp.key] : undefined;
  const caseStudyHref = tool.caseStudyPath ? `${links.showcase}${tool.caseStudyPath}` : undefined;
  const headingId = `tool-${tool.slug}-workbench`;

  return (
    <article className={styles.shell}>
      <PageHeader kicker="AI Workbench" title={tool.title} description={tool.shortDescription} />

      <div className={styles.meta}>
        <ToolLifecycleBadge lifecycle={tool.lifecycle} />
        <span className={styles.muted}>No sign-in needed</span>
      </div>

      <p className={styles.lead}>{tool.longDescription}</p>

      <div className={styles.summaryGrid}>
        <section>
          <h2>What to paste</h2>
          <p>{tool.inputSummary}</p>
        </section>
        <section>
          <h2>What you get</h2>
          <p>{tool.outputSummary}</p>
        </section>
      </div>

      <section className={styles.panel} aria-labelledby={headingId}>
        <h2 id={headingId}>Try it</h2>
        <div className={styles.notice}>
          <p>
            <strong>How AI is used.</strong> This tool drafts a proposal from your text. It can be wrong or incomplete.
            Items marked &ldquo;From your text&rdquo; quote where they came from; &ldquo;Inferred&rdquo; items are the
            AI&apos;s reasoning; &ldquo;Needs your input&rdquo; means your text didn&apos;t say.
          </p>
          <p>
            <strong>Your text.</strong> {tool.privacyStatement}
          </p>
        </div>
        {children}
      </section>

      <section className={styles.panel} aria-labelledby={`${headingId}-limits`}>
        <h2 id={`${headingId}-limits`}>Limitations</h2>
        <ul className={styles.list}>
          {tool.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>

      {relatedHref || caseStudyHref ? (
        <nav className={styles.links} aria-label="Related">
          {relatedHref && tool.relatedApp ? (
            <a href={relatedHref}>
              Continue in {tool.relatedApp.name} → <span className={styles.muted}>{tool.relatedApp.reason}</span>
            </a>
          ) : null}
          {caseStudyHref ? <a href={caseStudyHref}>See how it was built →</a> : null}
        </nav>
      ) : null}

      <p className={styles.muted}>
        Built by Ali Safari · Page last reviewed <time dateTime={tool.lastReviewed}>{formatDate(tool.lastReviewed)}</time>
      </p>
    </article>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
