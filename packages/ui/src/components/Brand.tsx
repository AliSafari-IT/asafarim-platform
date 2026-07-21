export type ProductName =
  | "Digital"
  | "Platform"
  | "Hub"
  | "Showcase"
  | "Admin"
  | "Vionto"
  | "Testora"
  | "AppBuilder";

export interface LogoMarkProps {
  /** Use the app accent color instead of ink. */
  accent?: boolean;
}

export function LogoMark({ accent }: LogoMarkProps) {
  return (
    <span
      className={accent ? "ui-logomark ui-logomark--accent" : "ui-logomark"}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" focusable="false">
        <path className="ui-logomark__circuit" d="M13.8 17.1h5.7l1.7-3.3 3.2 5.6h4.8v3h-6.6l-1.3-2.3h-7.5v-3Zm0 6.1h5.1l1.7-1.5 2.4 3h6.2v3h-7.6l-2.1-2.2h-5.7v-2.3Z" />
        <path className="ui-logomark__a" d="M3.2 27.8 12.7 4.2h6.2l3.3 7.8-3.1 7.4-3.8-9.8-7.1 18.2h-5Z" />
        <path className="ui-logomark__slash" d="M20.5 3.4h5.1L14.2 28.6H9.1L20.5 3.4Z" />
      </svg>
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
