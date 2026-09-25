import { auth, getAccessibleApps } from "@asafarim/auth";
import { ButtonLink, getPlatformLinks } from "@asafarim/ui";
import { AccessMap } from "./_components/AccessMap";
import { LaunchConsole, type LaunchConsoleApp } from "./_components/LaunchConsole";
import { getAccessMapNodes, initialsOf } from "./_lib/access-map-data";
import styles from "./home.module.css";

const FEATURES = [
  {
    glyph: "01",
    title: "Launchpad",
    body: "Every platform app — website, showcase, AI tools, admin — one console, one click.",
  },
  {
    glyph: "02",
    title: "Identity",
    body: "A single account with roles and permissions shared across all ASafarIM apps.",
  },
  {
    glyph: "03",
    title: "Control",
    body: "Profile and preferences managed once, respected everywhere.",
  },
];

export default async function HubHomePage() {
  const session = await auth();
  const user = session?.user;
  const links = getPlatformLinks();

  // Same registry + access rule as /apps: only apps this visitor can open,
  // minus the Hub itself (you are already standing in it).
  const apps: LaunchConsoleApp[] = getAccessibleApps({
    roles: user?.roles ?? [],
    authenticated: Boolean(user),
  })
    .filter((app) => app.key !== "hub" && app.key in links)
    .map((app) => ({
      key: app.key,
      name: app.name,
      glyph: app.glyph,
      description: app.description,
      meta: app.meta,
      href: links[app.key as keyof typeof links],
    }));

  const firstName = user?.name?.split(" ")[0] ?? user?.email ?? "";
  const roles = user?.roles ?? [];
  const mapNodes = getAccessMapNodes({ roles, authenticated: Boolean(user) }, links);
  const unlocked = mapNodes.filter((node) => node.granted).length;

  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>
            <span className={styles.tag}>✦ AI</span>
            Mission control
          </span>

          {user ? (
            <h1 className={styles.title}>
              Welcome back, <span className={styles.accent}>{firstName}.</span>
            </h1>
          ) : (
            <h1 className={styles.title}>
              One sign-in. <span className={styles.accent}>Every ASafarIM app.</span>
            </h1>
          )}

          <p className={styles.lede}>
            {user
              ? "Your workspace for AI apps, showcases and experiments — everything in the ASafarIM ecosystem launches from here."
              : "The Hub is the logged-in heart of the platform: launch AI apps, manage your identity and keep your settings in one place."}
          </p>

          <div className={styles.actions}>
            {user ? (
              <>
                <ButtonLink href="/dashboard">Open dashboard</ButtonLink>
                <ButtonLink href="/apps" variant="secondary">
                  All apps
                </ButtonLink>
              </>
            ) : (
              <ButtonLink href="/sign-in">Sign in to the Hub</ButtonLink>
            )}
          </div>

          <dl className={styles.stats}>
            <div>
              <dt>Apps</dt>
              <dd>{apps.length}</dd>
            </div>
            <div>
              <dt>Sign-in</dt>
              <dd>1</dd>
            </div>
            <div>
              <dt>{user ? "Roles" : "Languages"}</dt>
              <dd>{user ? user.roles.length : 5}</dd>
            </div>
          </dl>
        </div>

        <LaunchConsole apps={apps} allAppsHref={user ? "/apps" : undefined} />
      </section>

      <section className={styles.access} aria-labelledby="access-title">
        <div className={styles.accessCopy}>
          <p className={styles.sectionKicker}>How access works</p>
          <h2 id="access-title">
            One identity. <span className={styles.accent}>Every door checks it.</span>
          </h2>
          <ol className={styles.steps}>
            <li>
              <strong>Sign in once</strong>
              <span>Password, email code or Google — the Hub verifies who you are.</span>
            </li>
            <li>
              <strong>Carry a signed token</strong>
              <span>Your roles travel with you in a tamper-proof session, shared across every app.</span>
            </li>
            <li>
              <strong>Each app decides</strong>
              <span>
                {!user
                  ? `Without signing in, ${unlocked} of ${mapNodes.length} apps are open; the rest wait for an identity.`
                  : unlocked === mapNodes.length
                    ? `Your roles unlock all ${mapNodes.length} apps — every door opens for you.`
                    : `Right now your roles unlock ${unlocked} of ${mapNodes.length} apps; the rest turn the token away.`}
              </span>
            </li>
          </ol>
        </div>
        <div className={styles.accessMap}>
          <AccessMap
            nodes={mapNodes}
            centerLabel={user ? initialsOf(user.name, user.email ?? "ID") : "ID"}
            tokenLabel={user ? `roles: ${roles.join(", ") || "none"}` : "guest · public access"}
          />
        </div>
      </section>

      {!user && (
        <section className={styles.features} aria-label="What the Hub does">
          {FEATURES.map((feature) => (
            <article key={feature.title} className={styles.feature}>
              <span className={styles.featureGlyph} aria-hidden="true">
                {feature.glyph}
              </span>
              <h2>{feature.title}</h2>
              <p>{feature.body}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
