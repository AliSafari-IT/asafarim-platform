import { PLATFORM_ELEMENTS, type ShowcaseProject } from "../data";
import styles from "./analysis.module.css";

/**
 * Which project builds on which shared element. A real <table> rather than a
 * grid of divs: this is tabular data, and the row/column headers are what make
 * a filled cell meaningful to a screen reader — each cell carries its own
 * text, so the answer never depends on seeing the dot.
 */
export function CoverageMatrix({ projects }: { projects: ShowcaseProject[] }) {
  return (
    <div className={styles.matrixScroll}>
      <table className={styles.matrix}>
        <caption className={styles.matrixCaption}>
          Shared platform elements used by each project. A filled cell means the project builds on that
          element directly.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={styles.matrixCorner}>
              Project
            </th>
            {PLATFORM_ELEMENTS.map((element) => (
              <th key={element.id} scope="col" className={styles.matrixColHead}>
                <span className={styles.matrixColLabel}>{element.name}</span>
              </th>
            ))}
            <th scope="col" className={styles.matrixColHead}>
              <span className={styles.matrixColLabel}>Total</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.slug}>
              <th scope="row" className={styles.matrixRowHead}>
                {project.title}
              </th>
              {PLATFORM_ELEMENTS.map((element) => {
                const uses = project.dependsOn.includes(element.id);
                return (
                  <td key={element.id} className={styles.matrixCell} data-on={uses ? "true" : "false"}>
                    {uses ? (
                      <span className={styles.matrixDot}>
                        <span className={styles.srOnly}>
                          {project.title} uses {element.name}
                        </span>
                      </span>
                    ) : (
                      <span className={styles.srOnly}>
                        {project.title} does not use {element.name}
                      </span>
                    )}
                  </td>
                );
              })}
              <td className={styles.matrixTotal}>{project.dependsOn.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
