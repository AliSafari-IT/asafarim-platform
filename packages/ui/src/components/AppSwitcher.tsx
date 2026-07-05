export interface AppSwitcherLink {
  label: string;
  href: string;
  /** Technical meta shown right-aligned, e.g. "public" or "restricted". */
  meta?: string;
}

export interface AppSwitcherProps {
  links: AppSwitcherLink[];
}

/**
 * Cross-app navigation dropdown: keeps the header uncluttered by holding
 * links to the other platform apps. CSS-only (<details>), no client JS.
 */
export function AppSwitcher({ links }: AppSwitcherProps) {
  if (links.length === 0) return null;

  return (
    <details className="ui-menu">
      <summary aria-label="Platform apps">
        <span aria-hidden="true">⌘</span> Platform{" "}
        <span className="ui-menu__caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="ui-menu__panel">
        {links.map((link) => (
          <a key={link.href} href={link.href} className="ui-menu__item">
            <span>{link.label}</span>
            {link.meta ? <span className="u-mono">{link.meta}</span> : null}
          </a>
        ))}
      </div>
    </details>
  );
}
