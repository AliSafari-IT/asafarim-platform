export type ProductName =
  | "Digital"
  | "Platform"
  | "Hub"
  | "Showcase"
  | "Admin";

export interface LogoMarkProps {
  /** Use the app accent color instead of ink. */
  accent?: boolean;
}

/**
 * Temporary but intentional brand mark: a monospace "A/" chip.
 * Will be replaced by a designed logo without changing call sites.
 */
export function LogoMark({ accent }: LogoMarkProps) {
  return (
    <span
      className={accent ? "ui-logomark ui-logomark--accent" : "ui-logomark"}
      aria-hidden="true"
    >
      A/
    </span>
  );
}

export interface BrandWordmarkProps {
  /** Product suffix rendered as a technical chip next to the name. */
  product?: ProductName;
}

export function BrandWordmark({ product = "Digital" }: BrandWordmarkProps) {
  return (
    <span className="ui-wordmark">
      <span className="ui-wordmark__name">ASafarIM</span>
      <span className="ui-wordmark__product">{product}</span>
    </span>
  );
}
