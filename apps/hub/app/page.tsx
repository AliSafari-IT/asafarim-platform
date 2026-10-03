import { auth } from "@asafarim/auth";
import { ButtonLink, getPlatformLinks } from "@asafarim/ui";
import { AccessMap } from "./_components/AccessMap";
import { getAccessMapNodes, initialsOf } from "./_lib/access-map-data";
import styles from "./home.module.css";

const FEATURES = [
  {
    glyph: "01",
    title: "Launchpad",
    body: "Every platform app — website, showcase, AI tools, admin — one map, one click.",
  },
  {
    glyph: "02",
    title: "Identity",
    body: "A single account with roles and permissions shared across all ASafariM apps.",
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

  const firstName = user?.name?.split(" ")[0] ?? user?.email ?? "";
  const roles = user?.roles ?? [];
  // The same canAccessApp rule the apps enforce decides which nodes unlock.
  const mapNodes = getAccessMapNodes({ roles, authenticated: Boolean(user) }, links);
  const unlocked = mapNodes.filter((node) => node.granted && !node.preview).length;
  const previews = mapNodes.filter((node) => node.preview).length;
  const total = mapNodes.length;

  const steps = [
    { title: "Sign in once", body: "Password, email code or Google." },
    { title: "Carry a signed token", body: "Your roles travel with you to every app." },
    {
      title: "Each app decides",
      body: !user
        ? previews
          ? `As a guest, ${unlocked} apps are open and ${previews} in preview.`
          : `As a guest, ${unlocked} of ${total} apps are open.`
        : unlocked === total
          ? `Your roles unlock all ${total} apps.`
          : `Your roles unlock ${unlocked} of ${total} apps.`,
    },
  ];

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
              One sign-in. <span className={styles.accent}>Every ASafariM app.</span>
            </h1>
          )}

          <p className={styles.lede}>
            {user
              ? "One identity, checked at every door. Pick an app on the map to jump straight in."
              : "The Hub is the heart of the platform: one identity that every ASafariM app checks before it opens."}
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

          <ol className={styles.steps} aria-label="How access works">
            {steps.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className={styles.mapCard}>
          <div className={styles.mapHead}>
            <span className={styles.mapTitle}>Access map</span>
            <span className={styles.mapHint}>
              <span className={styles.live} aria-hidden="true" />
              Hover an app to open it
            </span>
          </div>
          <AccessMap
            nodes={mapNodes}
            centerLabel={user ? initialsOf(user.name, user.email ?? "ID") : "ID"}
            tokenLabel={user ? `roles: ${roles.join(", ") || "none"}` : "guest · public access"}
            compact
            interactive
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
