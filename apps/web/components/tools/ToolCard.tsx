import Link from "next/link";
import { Card } from "@asafarim/ui";
import type { ToolDefinition } from "../../lib/tools/types";
import { ToolLifecycleBadge } from "./ToolLifecycleBadge";
import styles from "./tools.module.css";

/** Catalogue card, driven entirely by the registry entry. Used by /tools (#674). */
export function ToolCard({ tool }: { tool: ToolDefinition }) {
  return (
    <Card variant="elevated" title={tool.title}>
      <div className={styles.card}>
        <p>
          <ToolLifecycleBadge lifecycle={tool.lifecycle} />
        </p>
        <p>{tool.shortDescription}</p>
        <p className={styles.muted}>
          <strong>Paste:</strong> {tool.inputSummary}
          <br />
          <strong>Get:</strong> {tool.outputSummary}
        </p>
        <Link href={`/tools/${tool.slug}`}>
          {tool.lifecycle === "paused" ? "View tool (paused)" : "Open tool"} →
        </Link>
      </div>
    </Card>
  );
}
