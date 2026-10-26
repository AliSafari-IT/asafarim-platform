import { ECOSYSTEM_APPS, type EcosystemApp } from "../links";

export interface AppSwitcherLink {
  label: string;
  href: string;
  /**
   * Technical meta, e.g. "hub.asafarim.com" or "vionto.asafarim.com · beta".
   * The part before the first " · " is shown as the host; the rest as tags.
   */
  meta?: string;
  /** Short monospace glyph for the tile, e.g. "WB". Falls back to initials. */
  glyph?: string;
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
  /**
   * Show the ASafariM OS and Android apps below the platform apps
   * (default true). They live outside this monorepo; see ECOSYSTEM_APPS.
   */
  showEcosystem?: boolean;
}

export interface AppSwitcherLabels {
  /** Visible text of the menu button. */
  platform: string;
  /** Accessible name of the menu button, and the platform-apps heading. */
  platformApps: string;
  /** Heading of the ASafariM OS section. */
  osSection: string;
  /** One line under "ASafariM OS". */
  osTagline: string;
  /** Heading of the Android apps section. */
  androidSection: string;
  /** One line under each Android app's name. */
  breinhapTagline: string;
  igsPharmaTagline: string;
  /** Badge for an Android app that is not public on Google Play yet. */
  playTesting: string;
}

const APP_SWITCHER_DEFAULTS: AppSwitcherLabels = {
  platform: "Platform",
  platformApps: "Platform apps",
  osSection: "ASafariM OS",
  osTagline: "Sign-in, notes and docs",
  androidSection: "Android apps",
  breinhapTagline: "Study companion",
  igsPharmaTagline: "Pharmacy app",
  playTesting: "Play testing",
};

/**
 * AppSwitcher labels from a `@asafarim/shared-i18n` translator (the
 * `shell.*` keys), so apps don't have to spell out every key.
 */
export function appSwitcherLabelsFrom(t: (key: string) => string): AppSwitcherLabels {
  return {
    platform: t("shell.platform"),
    platformApps: t("shell.platformApps"),
    osSection: t("shell.osSection"),
    osTagline: t("shell.osTagline"),
    androidSection: t("shell.androidApps"),
    breinhapTagline: t("shell.breinhapTagline"),
    igsPharmaTagline: t("shell.igsPharmaTagline"),
    playTesting: t("shell.playTesting"),
  };
}

function initials(label: string): string {
  return label
    .split(/[\s-]+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function taglineFor(app: EcosystemApp, l: AppSwitcherLabels): string {
  switch (app.key) {
    case "os":
      return l.osTagline;
    case "breinhap":
      return l.breinhapTagline;
    case "igs-pharma":
      return l.igsPharmaTagline;
  }
}

function ExternalIcon() {
  return (
    <svg className="ui-app-switcher__external" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M6 3.5h6.5V10M12.5 3.5 4 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg className="ui-app-switcher__heading-icon" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4" y="1.5" width="8" height="13" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 12h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function EcosystemItem({ app, l }: { app: EcosystemApp; l: AppSwitcherLabels }) {
  return (
    <li>
      <a
        href={app.href}
        className="ui-menu__item ui-app-switcher__item ui-app-switcher__item--wide"
        data-kind={app.kind}
      >
        <span className="ui-app-switcher__tile" aria-hidden="true">
          {app.glyph}
        </span>
        <span className="ui-app-switcher__body">
          <span className="ui-app-switcher__name">
            {app.name}
            {app.status === "play-testing" ? (
              <span className="ui-app-switcher__status">{l.playTesting}</span>
            ) : null}
          </span>
          <span className="ui-app-switcher__sub">
            {taglineFor(app, l)}
            <span aria-hidden="true"> · </span>
            <span className="ui-app-switcher__host">{app.host}</span>
          </span>
        </span>
        <ExternalIcon />
      </a>
    </li>
  );
}

/**
 * Cross-app navigation dropdown: keeps the header uncluttered by holding
 * links to the other platform apps, then the ASafariM OS and the Android
 * apps in their own sections. CSS-only (<details>), no client JS; Escape and
 * outside clicks are handled once by <MenuOutsideClick />.
 */
export function AppSwitcher({
  links,
  groupName = "ui-header-menu",
  labels,
  showEcosystem = true,
}: AppSwitcherProps) {
  const os = showEcosystem ? ECOSYSTEM_APPS.filter((app) => app.kind === "web") : [];
  const android = showEcosystem ? ECOSYSTEM_APPS.filter((app) => app.kind === "android") : [];
  if (links.length === 0 && os.length === 0 && android.length === 0) return null;
  const l = { ...APP_SWITCHER_DEFAULTS, ...labels };

  return (
    <details className="ui-menu ui-app-switcher" name={groupName}>
      <summary aria-label={l.platformApps}>
        <span aria-hidden="true">⌘</span>
        <span className="ui-app-switcher__label">{l.platform}</span>
        <span className="ui-menu__caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="ui-menu__panel ui-app-switcher__panel">
        {links.length > 0 ? (
          <section className="ui-app-switcher__section">
            <p className="ui-app-switcher__heading" aria-hidden="true">
              {l.platformApps}
            </p>
            <ul className="ui-app-switcher__grid" aria-label={l.platformApps}>
              {links.map((link) => {
                const [host, ...tags] = (link.meta ?? "").split(" · ");
                return (
                  <li key={link.href}>
                    <a href={link.href} className="ui-menu__item ui-app-switcher__item">
                      <span className="ui-app-switcher__tile" aria-hidden="true">
                        {link.glyph ?? initials(link.label)}
                      </span>
                      <span className="ui-app-switcher__body">
                        <span className="ui-app-switcher__name">{link.label}</span>
                        {host || tags.length > 0 ? (
                          <span className="ui-app-switcher__meta">
                            {host ? <span className="ui-app-switcher__host">{host}</span> : null}
                            {tags.map((tag) => (
                              <span key={tag} className="ui-app-switcher__tag">
                                {tag}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
        {os.length > 0 ? (
          <section className="ui-app-switcher__section">
            <p className="ui-app-switcher__heading" aria-hidden="true">
              {l.osSection}
            </p>
            <ul className="ui-app-switcher__list" aria-label={l.osSection}>
              {os.map((app) => (
                <EcosystemItem key={app.key} app={app} l={l} />
              ))}
            </ul>
          </section>
        ) : null}
        {android.length > 0 ? (
          <section className="ui-app-switcher__section">
            <p className="ui-app-switcher__heading" aria-hidden="true">
              <PhoneIcon />
              {l.androidSection}
            </p>
            <ul className="ui-app-switcher__list" aria-label={l.androidSection}>
              {android.map((app) => (
                <EcosystemItem key={app.key} app={app} l={l} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </details>
  );
}
