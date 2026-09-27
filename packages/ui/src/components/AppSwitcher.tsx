export interface AppSwitcherLink {
  label: string;
  href: string;
  /** Technical meta shown right-aligned, e.g. "public" or "restricted". */
  meta?: string;
}

export interface AppSwitcherProps {
  links: AppSwitcherLink[];
  /**
   * Shared `name` for the native <details> exclusive-accordion group: when
   * set, opening this menu auto-closes any other <details name="..."> with
   * the same value (e.g. the header's <UserMenu />). CSS-only, no JS.
   */
  groupName?: string;
  /** Override any label for localization. */
  labels?: Partial<AppSwitcherLabels>;
}

export interface AppSwitcherLabels {
  /** Visible text of the menu button. */
  platform: string;
  /** Accessible name of the menu button. */
  platformApps: string;
}

const APP_SWITCHER_DEFAULTS: AppSwitcherLabels = {
  platform: "Platform",
  platformApps: "Platform apps",
};

/**
 * Cross-app navigation dropdown: keeps the header uncluttered by holding
 * links to the other platform apps. CSS-only (<details>), no client JS.
 */
export function AppSwitcher({ links, groupName = "ui-header-menu", labels }: AppSwitcherProps) {
  if (links.length === 0) return null;
  const l = { ...APP_SWITCHER_DEFAULTS, ...labels };

  return (
    <details className="ui-menu" name={groupName}>
      <summary aria-label={l.platformApps}>
        <span aria-hidden="true">⌘</span>
        <span className="ui-app-switcher__label">{l.platform}</span>
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
