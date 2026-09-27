import { Badge, ButtonLink, Card, getPlatformLinks, type BadgeTone } from "@asafarim/ui";
import type { ToolCardLabels } from "../../lib/tools/labels";
import { toolAvailability, type ToolAvailability, type ToolDefinition } from "../../lib/tools/types";
import { ToolLifecycleBadge } from "./ToolLifecycleBadge";
import styles from "./tools.module.css";

const AVAILABILITY_TONE: Record<ToolAvailability, BadgeTone> = {
  live: "success",
  "examples-only": "neutral",
  paused: "warning",
};

/**
 * Catalogue card, driven entirely by the registry entry. One primary action
 * (use/view the tool); the full app and case study are quieter text links.
 */
export function ToolCard({ tool, labels }: { tool: ToolDefinition; labels: ToolCardLabels }) {
  const links = getPlatformLinks();
  const availability = toolAvailability(tool);
  const relatedHref = tool.relatedApp ? links[tool.relatedApp.key] : undefined;
  const caseStudyHref = tool.caseStudyPath ? `${links.showcase}${tool.caseStudyPath}` : undefined;

  return (
    <Card variant="elevated" title={tool.title}>
      <div className={styles.card} data-availability={availability}>
        <p className={styles.meta}>
          <ToolLifecycleBadge lifecycle={tool.lifecycle} label={labels.lifecycle[tool.lifecycle]} />
          <Badge tone={AVAILABILITY_TONE[availability]}>{labels.availability[availability]}</Badge>
        </p>
        <p>{tool.shortDescription}</p>
        <dl className={styles.facts}>
          <dt>{labels.paste}</dt>
          <dd>{tool.inputSummary}</dd>
          <dt>{labels.get}</dt>
          <dd>{tool.outputSummary}</dd>
        </dl>
        <p className={styles.muted}>{labels.privacy}</p>
        <div className={styles.cardActions}>
          <ButtonLink href={`/tools/${tool.slug}`} size="sm">
            {availability === "paused" ? labels.view : labels.use}
            <span className={styles.srOnly}>: {tool.title}</span>
          </ButtonLink>
          {relatedHref && tool.relatedApp ? (
            <a href={relatedHref}>{labels.continueIn(tool.relatedApp.name)}</a>
          ) : null}
          {caseStudyHref ? <a href={caseStudyHref}>{labels.caseStudy}</a> : null}
        </div>
      </div>
    </Card>
  );
}
