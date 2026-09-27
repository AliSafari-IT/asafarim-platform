import { Badge, Metric } from "@asafarim/ui";
import type { NpmPortfolio, WorkspaceCard } from "../data";
import styles from "../proof.module.css";
import { CommitIcon, DownloadIcon, ExternalIcon, GitHubIcon, NpmIcon } from "./Icons";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const exact = new Intl.NumberFormat("en");
const ACTIVE_WINDOW_DAYS = 14;

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(`${isoDate}T00:00:00Z`).getTime()) / 86_400_000);
}

function RecencyDot({ date }: { date: string }) {
  const days = daysSince(date);
  const active = days <= ACTIVE_WINDOW_DAYS;
  const label = days <= 0 ? "changed today" : days === 1 ? "changed yesterday" : `changed ${days} days ago`;
  return <span className={active ? styles.dotActive : styles.dotIdle} title={label} aria-label={label} />;
}

function IconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a className={styles.iconLink} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
      {children}
    </a>
  );
}

function NpmGroup({ portfolio }: { portfolio: NpmPortfolio }) {
  if (portfolio.packages.length === 0) {
    return <p className={styles.note}>The npm registry could not be reached just now — no numbers are shown rather than stale ones.</p>;
  }
  const top = Math.max(1, ...portfolio.packages.map((p) => p.downloads ?? 0));
  return (
    <div className={styles.inventoryGrid}>
      {portfolio.packages.map((pkg) => (
        <article key={pkg.name} className={styles.inventoryCard}>
          <header className={styles.cardHead}>
            <span className={styles.npmMark}>
              <NpmIcon size={16} />
            </span>
            <a className={styles.cardName} href={pkg.npmUrl} target="_blank" rel="noopener noreferrer">
              {pkg.name}
            </a>
            <span className={styles.versionChip} title={`Latest on npm, published ${pkg.lastPublished}`}>
              v{pkg.version}
            </span>
          </header>
          {pkg.description ? <p className={styles.cardDescription}>{pkg.description}</p> : null}
          <div
            className={styles.downloadBar}
            role="presentation"
            style={{ ["--share" as string]: `${Math.max(2, ((pkg.downloads ?? 0) / top) * 100)}%` }}
          />
          <footer className={styles.cardFoot}>
            <span className={styles.stat} title={pkg.downloads !== null ? `${exact.format(pkg.downloads)} downloads all-time` : undefined}>
              <DownloadIcon />
              {pkg.downloads !== null ? (
                <>
                  <strong>{compact.format(pkg.downloads)}</strong> all-time
                </>
              ) : (
                "downloads unavailable"
              )}
              {pkg.weeklyDownloads ? <span className={styles.statSub}> · {exact.format(pkg.weeklyDownloads)}/wk</span> : null}
            </span>
            {pkg.usedHere ? <Badge tone="info">used here</Badge> : null}
            <span className={styles.links}>
              <IconLink href={pkg.npmUrl} label={`${pkg.name} on npm`}>
                <NpmIcon />
              </IconLink>
              {pkg.repoUrl ? (
                <IconLink href={pkg.repoUrl} label={`${pkg.name} source on GitHub`}>
                  <GitHubIcon />
                </IconLink>
              ) : null}
              {pkg.homepageUrl && pkg.homepageUrl !== pkg.repoUrl && !pkg.homepageUrl.startsWith(`${pkg.repoUrl}#`) ? (
                <IconLink href={pkg.homepageUrl} label={`${pkg.name} demo / docs`}>
                  <ExternalIcon />
                </IconLink>
              ) : null}
            </span>
          </footer>
        </article>
      ))}
    </div>
  );
}

function WorkspaceGroup({ cards }: { cards: WorkspaceCard[] }) {
  return (
    <div className={styles.inventoryGrid}>
      {cards.map((card) => (
        <article key={card.name} className={styles.inventoryCard}>
          <header className={styles.cardHead}>
            <RecencyDot date={card.date} />
            <a className={styles.cardName} href={card.githubUrl} target="_blank" rel="noopener noreferrer">
              {card.label}
            </a>
            <a
              className={styles.revChip}
              href={card.commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={`Last commit touching ${card.folder}, ${card.date}`}
            >
              <CommitIcon />
              {card.sha.slice(0, 7)}
            </a>
          </header>
          {card.kind === "app" && card.label !== card.name ? <p className={styles.cardPackage}>{card.name}</p> : null}
          {card.description ? <p className={styles.cardDescription}>{card.description}</p> : null}
          <footer className={styles.cardFoot}>
            <span className={styles.stat} title={`First commit ${card.since}`}>
              <strong>{exact.format(card.commits)}</strong> commits
              <span className={styles.statSub}> · updated {card.date}</span>
            </span>
            {card.kind === "package" && card.dependents > 0 ? (
              <Badge tone="neutral">
                used by {card.dependents} workspace{card.dependents === 1 ? "" : "s"}
              </Badge>
            ) : null}
            <span className={styles.links}>
              <IconLink href={card.githubUrl} label={`${card.folder} on GitHub`}>
                <GitHubIcon />
              </IconLink>
              {card.liveUrl ? (
                <IconLink href={card.liveUrl} label={`Open ${card.label} live`}>
                  <ExternalIcon />
                </IconLink>
              ) : null}
            </span>
          </footer>
        </article>
      ))}
    </div>
  );
}

/**
 * Three honest kinds of "version": npm packages carry real semver and
 * public download counts; workspace packages and apps are never published,
 * so their version is the last commit that touched them.
 */
export function ShippedInventory({ npm, workspaces }: { npm: NpmPortfolio; workspaces: WorkspaceCard[] }) {
  const packages = workspaces.filter((w) => w.kind === "package");
  const apps = workspaces.filter((w) => w.kind === "app");
  const activeApps = apps.filter((a) => daysSince(a.date) <= ACTIVE_WINDOW_DAYS).length;

  return (
    <>
      <div className="ui-grid">
        <Metric
          label="Published on npm"
          value={npm.packages.length || "—"}
          hint={npm.freshness === "live" ? `live from the npm registry · ${npm.measuredAt}` : "registry unreachable"}
        />
        <Metric
          label="All-time npm downloads"
          value={npm.totalDownloads !== null ? exact.format(npm.totalDownloads) : "—"}
          hint="api.npmjs.org, summed per package"
        />
        <Metric label="Workspace packages" value={packages.length} hint="packages/* · consumed via workspace:*" />
        <Metric label="Apps in production" value={apps.length} hint={`${activeApps} changed in the last ${ACTIVE_WINDOW_DAYS} days`} />
      </div>

      <div className={styles.groupHead}>
        <h3 className={styles.groupTitle}>
          <NpmIcon size={18} /> Published on npm
        </h3>
        <p className={styles.groupNote}>
          Open-source building blocks published from the <code>@asafarim</code> npm account and used across my apps.
          Sorted by all-time downloads; the bar is each package&rsquo;s share of the most-downloaded one.
        </p>
      </div>
      <NpmGroup portfolio={npm} />

      <div className={styles.groupHead}>
        <h3 className={styles.groupTitle}>
          <GitHubIcon size={18} /> Platform workspace packages
        </h3>
        <p className={styles.groupNote}>
          Internal to this monorepo and never published, so they don&rsquo;t carry independent semver. Their real
          version is the last commit that touched the folder, linked below. A green dot means it changed in the last{" "}
          {ACTIVE_WINDOW_DAYS} days.
        </p>
      </div>
      <WorkspaceGroup cards={packages} />

      <div className={styles.groupHead}>
        <h3 className={styles.groupTitle}>
          <ExternalIcon size={18} /> Apps
        </h3>
        <p className={styles.groupNote}>Each one ships as its own container on every push to main. Open the live app or read its source.</p>
      </div>
      <WorkspaceGroup cards={apps} />
    </>
  );
}
