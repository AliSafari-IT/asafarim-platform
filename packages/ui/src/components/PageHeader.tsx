import type { ReactNode } from "react";
import { Kicker } from "./Kicker";

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Monospace micro-label above the title. */
  kicker?: string;
  /** Coordinate-style index shown in the kicker, e.g. "02". */
  kickerIndex?: string;
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  kicker,
  kickerIndex,
  actions,
}: PageHeaderProps) {
  return (
    <div className="ui-pageheader">
      <div>
        {kicker ? <Kicker index={kickerIndex}>{kicker}</Kicker> : null}
        <h1>{title}</h1>
        {description ? <p className="ui-pageheader__desc">{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </div>
  );
}
