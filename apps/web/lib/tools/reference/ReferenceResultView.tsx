import { ProvenanceBadge } from "../../../components/tools/ProvenanceBadge";
import styles from "../../../components/tools/tools.module.css";
import type { ReferenceResult } from "./schema";

export function ReferenceResultView({ result }: { result: ReferenceResult }) {
  return (
    <ol className={styles.itemList} aria-label="Checklist">
      {result.items.map((item, index) => (
        <li key={index} className={styles.item}>
          <ProvenanceBadge provenance={item.provenance} />
          <p>{item.text}</p>
          {item.source ? (
            <blockquote className={styles.source}>
              <span className={styles.srOnly}>Source: </span>
              {item.source}
            </blockquote>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
