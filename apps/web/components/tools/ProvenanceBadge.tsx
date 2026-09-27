import { PROVENANCE_LABELS, type Provenance } from "../../lib/tools/provenance";
import styles from "./tools.module.css";

/** Visible extracted / inferred / uncertain label (charter §3). Text, not colour alone. */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const { label, description } = PROVENANCE_LABELS[provenance];
  return (
    <span className={`${styles.provenance} ${styles[`provenance-${provenance}`]}`} title={description}>
      {label}
    </span>
  );
}
