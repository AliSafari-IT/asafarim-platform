import type { ReactNode } from "react";

export type CardVariant = "default" | "elevated" | "studio" | "console" | "gallery";

export interface CardProps {
  title?: string;
  variant?: CardVariant;
  /** Adds hover lift — use when the card is wrapped in a link. */
  interactive?: boolean;
  children: ReactNode;
}

export function Card({
  title,
  variant = "default",
  interactive,
  children,
}: CardProps) {
  const classes = [
    "ui-card",
    variant !== "default" ? `ui-card--${variant}` : null,
    interactive ? "ui-card--interactive" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes}>
      {title ? <h3>{title}</h3> : null}
      <div className="ui-card__body">{children}</div>
    </section>
  );
}
