import type { Metadata } from "next";
import { requireUser, hasRole, ROLES, getAccessibleApps } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { Badge, ButtonLink, getPlatformLinks } from "@asafarim/ui";
import {
  countSignInsSince,
  getRecentSignIns,
  providerLabel,
  timeAgo,
} from "../_lib/account-insights";
import { profileStrength } from "../_lib/profile-strength";
import { AccessMap } from "../_components/AccessMap";
import { getAccessMapNodes, initialsOf } from "../_lib/access-map-data";
import styles from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard" };

const DAY = 24 * 3600 * 1000;

export default async function DashboardPage() {
  const session = await requireUser({ callbackUrl: "/dashboard" });
  const links = getPlatformLinks();
  const isAdminUser = hasRole(session, [ROLES.ADMIN]);
  const now = new Date();

  const [user, signIns, signInsLast30] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        username: true,
        image: true,
        bio: true,
        jobTitle: true,
        company: true,
        website: true,
        phone: true,
        timezone: true,
        emailVerified: true,
        createdAt: true,
        accounts: { select: { provider: true } },
        _count: { select: { locations: true } },
      },
    }),
    getRecentSignIns(session.user.id, 6),
    countSignInsSince(session.user.id, new Date(now.getTime() - 30 * DAY)),
  ]);

  const strength = user
    ? profileStrength({ ...user, locationCount: user._count.locations })
    : 0;
  const memberSince = user?.createdAt
    ? user.createdAt.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : "—";

  // Same registry + access rule as /apps; Hub itself is skipped.
  const apps = getAccessibleApps({ roles: session.user.roles, authenticated: true })
    .filter((app) => app.key !== "hub" && app.key in links)
    .map((app) => ({ ...app, href: links[app.key as keyof typeof links] }));

  const mapNodes = getAccessMapNodes(
    { roles: session.user.roles, authenticated: true },
    links
  );

  const firstName = session.user.name?.split(" ")[0] ?? session.user.email;
  const methods = [
    ...(user?.accounts.map((a) => providerLabel(a.provider)) ?? []),
  ];

  const stats = [
    {
      label: "Access",
      value: isAdminUser ? "Admin" : "Standard",
      hint: session.user.roles.join(", ") || "no roles",
    },
    {
      label: "Sign-ins · 30d",
      value: String(signInsLast30),
      hint: signIns[0] ? `last ${timeAgo(signIns[0].at, now)}` : "no sign-ins recorded",
    },
    {
      label: "Profile strength",
      value: `${strength}%`,
      hint: strength < 100 ? "complete it on your profile" : "fully complete",
      meter: strength,
    },
    {
      label: "Member since",
      value: memberSince,
      hint: user?.emailVerified ? "email verified" : "email not verified",
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>01 / Command center</p>
          <h1>Welcome back, {firstName}</h1>
          <p className={styles.sub}>Your account at a glance and everything you can launch.</p>
        </div>
        <div className={styles.headActions}>
          <ButtonLink href="/profile" variant="secondary" size="sm">
            Edit profile
          </ButtonLink>
          <ButtonLink href="/apps" size="sm">
            All apps
          </ButtonLink>
        </div>
      </header>

      <section className={styles.stats} aria-label="Account summary">
        {stats.map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <span className={styles.statLabel}>{stat.label}</span>
            <strong className={styles.statValue}>{stat.value}</strong>
            {"meter" in stat && stat.meter !== undefined ? (
              <span className={styles.statMeter}>
                <span style={{ width: `${Math.max(stat.meter, 4)}%` }} />
              </span>
            ) : null}
            <span className={styles.statHint}>{stat.hint}</span>
          </div>
        ))}
      </section>

      <div className={styles.columns}>
        <div className={styles.primary}>
        <section className={styles.panel} aria-labelledby="access-title">
          <div className={styles.panelHead}>
            <h2 id="access-title">Access map</h2>
            <span className={styles.count}>live · from your roles</span>
          </div>
          <AccessMap
            nodes={mapNodes}
            centerLabel={initialsOf(session.user.name, session.user.email ?? "ID")}
            tokenLabel={`roles: ${session.user.roles.join(", ") || "none"}`}
            compact
          />
        </section>

        <section className={styles.panel} aria-labelledby="launchpad-title">
          <div className={styles.panelHead}>
            <h2 id="launchpad-title">Launchpad</h2>
            <span className={styles.count}>{apps.length} apps</span>
          </div>
          <ul className={styles.apps}>
            {apps.map((app) => (
              <li key={app.key}>
                <a href={app.href} className={styles.app}>
                  <span className={styles.glyph} aria-hidden="true">
                    {app.glyph}
                  </span>
                  <span className={styles.appText}>
                    <span className={styles.appName}>{app.name}</span>
                    <span className={styles.appDesc}>{app.description}</span>
                  </span>
                  <span className={styles.arrow} aria-hidden="true">
                    →
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
        </div>

        <div className={styles.side}>
          <section className={styles.panel} aria-labelledby="activity-title">
            <div className={styles.panelHead}>
              <h2 id="activity-title">Recent sign-ins</h2>
              <a href="/settings#activity" className={styles.link}>
                Security →
              </a>
            </div>
            {signIns.length > 0 ? (
              <ol className={styles.timeline}>
                {signIns.map((event, i) => (
                  <li key={event.id} className={i === 0 ? styles.current : undefined}>
                    <span className={styles.dot} aria-hidden="true" />
                    <div className={styles.eventText}>
                      <span className={styles.eventDevice}>{event.device}</span>
                      <span className={styles.eventMeta}>
                        {event.provider}
                        {event.ip ? ` · ${event.ip}` : ""}
                      </span>
                    </div>
                    <time dateTime={event.at.toISOString()} title={event.at.toLocaleString("en-GB")}>
                      {timeAgo(event.at, now)}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.empty}>No sign-ins recorded yet.</p>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="account-title">
            <div className={styles.panelHead}>
              <h2 id="account-title">Account</h2>
              <a href="/profile" className={styles.link}>
                Profile →
              </a>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>Email</dt>
                <dd>{session.user.email}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>@{user?.username ?? "—"}</dd>
              </div>
              <div>
                <dt>Roles</dt>
                <dd className={styles.badges}>
                  {session.user.roles.map((role) => (
                    <Badge key={role} tone={role === "superadmin" || role === "admin" ? "info" : "neutral"}>
                      {role}
                    </Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt>Linked sign-in</dt>
                <dd>{methods.length > 0 ? methods.join(", ") : "None"}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
