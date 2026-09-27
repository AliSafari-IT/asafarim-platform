import type { ReactNode } from "react";
import { PageHeader, getPlatformLinks } from "@asafarim/ui";
import type { ToolDefinition } from "../../lib/tools/types";
import { ToolLifecycleBadge } from "./ToolLifecycleBadge";
import { ToolStructuredData } from "./ToolStructuredData";
import { ToolViewTracker, TrackedToolLink } from "./ToolTracking";
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
    // Tool pages are English-only (docs/ai-tools/seo.md): mark them so, whatever the site locale.
    <article className={styles.shell} lang="en">
      {tool.indexable ? <ToolStructuredData tool={tool} /> : null}
      <ToolViewTracker tool={tool.slug} lifecycle={tool.lifecycle} />
      <PageHeader kicker="AI Workbench" title={tool.title} description={tool.shortDescription} />

      <div className={styles.meta}>
        <ToolLifecycleBadge lifecycle={tool.lifecycle} />
        <span className={styles.muted}>Free to use · No sign-in needed</span>
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

      <section className={styles.panel} aria-labelledby={`${headingId}-example`}>
        <h2 id={`${headingId}-example`}>Worked example</h2>
        <p>
          A synthetic example you can run above with &ldquo;{tool.example.label}&rdquo;. It works even when live generation is off, and its result is
          labelled as a prepared sample.
        </p>
        <blockquote className={styles.example}>{excerpt(tool.example.input)}</blockquote>
      </section>

      <section className={styles.panel} aria-labelledby={`${headingId}-how`}>
        <h2 id={`${headingId}-how`}>How it works</h2>
        <ul className={styles.list}>
          {tool.howItWorks.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className={styles.muted}>
          How your text is handled: <a href="/privacy">privacy</a>. Terms for AI results: <a href="/terms">terms</a>.
        </p>
      </section>

      <section className={styles.panel} aria-labelledby={`${headingId}-limits`}>
        <h2 id={`${headingId}-limits`}>Limitations</h2>
        <ul className={styles.list}>
          {tool.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>

      <nav className={styles.links} aria-label="Related">
        {relatedHref && tool.relatedApp ? (
          <a href={relatedHref}>
            Continue in {tool.relatedApp.name} → <span className={styles.muted}>{tool.relatedApp.reason}</span>
          </a>
        ) : null}
        {caseStudyHref ? (
          <TrackedToolLink href={caseStudyHref} tool={tool.slug} event="ai_tool_case_study_opened">
            See how it was built →
          </TrackedToolLink>
        ) : null}
        <TrackedToolLink href="/contact" tool={tool.slug} event="ai_tool_contact_opened">
          Discuss this kind of system →
        </TrackedToolLink>
      </nav>

      {/* After the tool has done its job, never before it (#683). */}
      <aside className={styles.author} aria-label="About the builder">
        <p>
          <strong>Built by Ali Safari</strong>, a full-stack and AI engineer. This is one of three small tools built to show how AI output can
          stay checkable: typed contracts, visible sources, server-side checks, and an eval gate before anything goes live.
        </p>
      </aside>

      <p className={styles.muted}>
        Built by <a href="/about">Ali Safari</a> at ASafarIM Digital · Page last reviewed <time dateTime={tool.lastReviewed}>{formatDate(tool.lastReviewed)}</time>
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

/** The first few lines of the example, for a page that reads well without running anything. */
function excerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 600 ? `${trimmed.slice(0, 600).replace(/\s+\S*$/, "")} …` : trimmed;
}
