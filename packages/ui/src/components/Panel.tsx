import type { ReactNode } from "react";

export interface PanelProps {
  /** Technical header label (rendered uppercase mono). */
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Console-style surface with a technical header — the admin workhorse. */
export function Panel({ title, actions, children }: PanelProps) {
  return (
    <section className="ui-panel">
      <header className="ui-panel__head">
        <span>{title}</span>
        {actions ? <span>{actions}</span> : null}
      </header>
      <div className="ui-panel__body">{children}</div>
    </section>
  );
}
