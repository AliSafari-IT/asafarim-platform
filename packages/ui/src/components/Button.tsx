import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "console";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  const classes = [
    "ui-btn",
    `ui-btn--${variant}`,
    size === "sm" ? "ui-btn--sm" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={classes} {...props} />;
}

export interface ButtonLinkProps {
  href: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  newTab?: boolean;
  children: React.ReactNode;
}

/** Link styled as a button — for navigation actions. */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  newTab,
  children,
}: ButtonLinkProps) {
  const classes = [
    "ui-btn",
    `ui-btn--${variant}`,
    size === "sm" ? "ui-btn--sm" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <a
      href={href}
      className={classes}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
    >
      {children}
    </a>
  );
}
