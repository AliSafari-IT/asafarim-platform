import type { ReactNode } from "react";
import { Kicker } from "./Kicker";

export interface SectionProps {
  kicker?: string;
  kickerIndex?: string;
  title?: string;
  children: ReactNode;
}

/** Page section with the shared kicker + heading rhythm. */
export function Section({ kicker, kickerIndex, title, children }: SectionProps) {
  return (
    <section className="ui-section">
      {kicker ? <Kicker index={kickerIndex}>{kicker}</Kicker> : null}
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}
