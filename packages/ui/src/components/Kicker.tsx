import type { ReactNode } from "react";

export interface KickerProps {
  /** Optional coordinate-style index, e.g. "01". */
  index?: string;
  children: ReactNode;
}

/** Monospace micro-label that opens a section — part of the shared DNA. */
export function Kicker({ index, children }: KickerProps) {
  return (
    <div className="ui-kicker">
      {index ? <span className="ui-kicker__index">{index} /</span> : null}
      <span>{children}</span>
    </div>
  );
}
