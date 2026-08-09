import { PLATFORM_ELEMENTS, type PlatformTier, type ShowcaseProject } from "../data";
import styles from "./analysis.module.css";

const TIERS: { id: PlatformTier; label: string; note: string }[] = [
  { id: "experience", label: "Experience", note: "One Next.js app per product, behind a single reverse proxy." },
  { id: "shared", label: "Shared platform", note: "Built once in packages/*, consumed by every app above." },
  { id: "data", label: "State", note: "Where things are persisted, queued, and stored." },
];

/**
 * Layered architecture diagram. Not the shared `PlatformMap`, which is
 * hub-and-spoke — one centre, one ring of nodes — and cannot express three
 * tiers or which app touches which element.
 *
 * Built from flow layout rather than SVG so it reflows into a single column on
 * narrow screens instead of scrolling sideways or scaling the text down; a
 * fixed viewBox would do neither. Load figures come from each project's
 * `dependsOn`, so the picture cannot drift away from the data underneath it,
 * and the same relationships are stated exactly in the coverage matrix below —
 * nothing here is the only source of a fact.
 */
export function ArchitectureDiagram({ projects }: { projects: ShowcaseProject[] }) {
  const shared = PLATFORM_ELEMENTS.filter((element) => element.tier === "shared");
  const data = PLATFORM_ELEMENTS.filter((element) => element.tier === "data");

  // How many projects lean on each element — drives the connector weight, so a
  // heavily-shared package visibly carries more load than a niche one.
  const usage = new Map<string, number>();
  for (const project of projects) {
    for (const id of project.dependsOn) {
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }
  const maxUsage = Math.max(1, ...usage.values());

  const deployed = projects.filter((project) => project.externalUrl);

  return (
    <div className={styles.diagram}>
      {TIERS.map((tier) => (
        <section key={tier.id} className={styles.tier} aria-labelledby={`tier-${tier.id}`}>
          <div className={styles.tierHead}>
            <h3 id={`tier-${tier.id}`} className={styles.tierLabel}>
              {tier.label}
            </h3>
            <p className={styles.tierNote}>{tier.note}</p>
          </div>

          <div className={styles.tierNodes}>
            {tier.id === "experience"
              ? projects.map((project) => (
                  <div
                    key={project.slug}
                    className={styles.appNode}
                    data-deployed={project.externalUrl ? "true" : "false"}
                  >
                    <span className={styles.appGlyph} aria-hidden="true">
                      {project.glyph}
                    </span>
                    <span className={styles.nodeName}>{project.title}</span>
                    <span className={styles.nodeMeta}>
                      {project.dependsOn.length} shared {project.dependsOn.length === 1 ? "element" : "elements"}
                    </span>
                  </div>
                ))
              : (tier.id === "shared" ? shared : data).map((element) => {
                  const count = usage.get(element.id) ?? 0;
                  return (
                    <div
                      key={element.id}
                      className={styles.elementNode}
                      // Load drives the left border weight and fill opacity.
                      style={{ ["--load" as string]: String(count / maxUsage) }}
                    >
                      <span className={styles.nodeName}>{element.name}</span>
                      <span className={styles.nodeCode}>{element.package}</span>
                      <span className={styles.nodeMeta}>{element.blurb}</span>
                      <span className={styles.nodeCount}>
                        {count} of {projects.length} projects
                      </span>
                    </div>
                  );
                })}
          </div>

          {tier.id !== "data" ? <div className={styles.tierLink} aria-hidden="true" /> : null}
        </section>
      ))}

      <p className={styles.diagramFoot}>
        {deployed.length} of {projects.length} projects are deployed and reachable today. Every app in the top
        tier authenticates through the same identity package and renders with the same design system — the
        reason a new product starts as a page, not a stack.
      </p>
    </div>
  );
}
