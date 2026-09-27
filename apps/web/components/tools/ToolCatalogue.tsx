import { ButtonLink, EmptyState, Section, getPlatformLinks } from "@asafarim/ui";
import { toolCardLabels, type Translate } from "../../lib/tools/labels";
import type { ToolDefinition } from "../../lib/tools/types";
import { ToolCard } from "./ToolCard";
import styles from "./tools.module.css";

const PRINCIPLES = ["review", "grounded", "private"] as const;

/**
 * The /tools body. Presentational: the page passes the validated, ordered
 * list from `getListedTools()`, so tests can render populated, paused, and
 * empty catalogues without touching the real registry.
 */
export function ToolCatalogue({ tools, t }: { tools: ToolDefinition[]; t: Translate }) {
  const links = getPlatformLinks();
  const labels = toolCardLabels(t);

  return (
    <>
      <Section title={t("web.tools.principles.heading")}>
        <ul className={styles.principles}>
          {PRINCIPLES.map((key) => (
            <li key={key}>
              <strong>{t(`web.tools.principle.${key}.title`)}</strong>
              <span>{t(`web.tools.principle.${key}.body`)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("web.tools.list.heading")}>
        {tools.length ? (
          <div className="ui-grid" data-testid="tool-grid">
            {tools.map((tool) => (
              <ToolCard key={tool.slug} tool={tool} labels={labels} />
            ))}
          </div>
        ) : (
          <EmptyState
            glyph="[ ··· ]"
            title={t("web.tools.empty.title")}
            description={t("web.tools.empty.body")}
            action={
              <ButtonLink href={links.labs} variant="secondary" size="sm">
                {t("web.tools.empty.labs")}
              </ButtonLink>
            }
          />
        )}
      </Section>

      {tools.length ? (
        <p className={styles.muted}>
          {t("web.tools.more.body")} <a href={links.labs}>{t("web.tools.more.labsLink")}</a>
        </p>
      ) : null}
    </>
  );
}
