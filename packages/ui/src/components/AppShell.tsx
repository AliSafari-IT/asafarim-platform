import type { ReactNode } from "react";
import { BrandWordmark, LogoMark, type ProductName } from "./Brand";

export interface AppShellProps {
  /** Product suffix in the brand chip (Hub, Admin, ...). */
  product: ProductName;
  /** Top navigation, usually a <TopNav />. */
  nav?: ReactNode;
  /** Right side of the header, usually a <UserMenu /> or sign-in button. */
  user?: ReactNode;
  /** Optional sidebar, usually a <SideNav />. */
  sideNav?: ReactNode;
  /** Extra footer content (left side gets the identity line). */
  footer?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  product,
  nav,
  user,
  sideNav,
  footer,
  children,
}: AppShellProps) {
  return (
    <div className="ui-shell">
      <header className="ui-shell__header">
        <a href="/" className="ui-shell__brand">
          <LogoMark accent />
          <BrandWordmark product={product} />
        </a>
        <div className="ui-shell__nav">{nav}</div>
        {user ? <div>{user}</div> : null}
      </header>
      <div className="ui-shell__body">
        {sideNav ? <aside className="ui-shell__side">{sideNav}</aside> : null}
        <main className="ui-shell__main">{children}</main>
      </div>
      <footer className="ui-shell__footer">
        <span>
          <strong>ASafarIM Digital</strong> — practical apps, built with care.
        </span>
        {footer}
        <span className="ui-shell__footer-meta">
          asafarim-platform · {new Date().getFullYear()}
        </span>
      </footer>
    </div>
  );
}
