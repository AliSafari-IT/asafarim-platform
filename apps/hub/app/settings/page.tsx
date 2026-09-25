import type { Metadata } from "next";
import { requireUser } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { getRecentSignIns, timeAgo } from "../_lib/account-insights";
import { PasswordChangeForm } from "./_components/PasswordChangeForm";
import styles from "./settings.module.css";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { id: "security", label: "Password" },
  { id: "methods", label: "Sign-in methods" },
  { id: "activity", label: "Recent sign-ins" },
  { id: "planned", label: "Coming next" },
];

const PLANNED = [
  { title: "Notifications", body: "Email preferences for platform and product updates." },
  { title: "Remote sign-out", body: "See active sessions per device and sign them out." },
];

export default async function SettingsPage() {
  const session = await requireUser({ callbackUrl: "/settings" });
  const now = new Date();

  const [user, signIns] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        password: true,
        emailVerified: true,
        accounts: { select: { provider: true } },
      },
    }),
    getRecentSignIns(session.user.id, 10),
  ]);

  const hasPassword = Boolean(user?.password);
  const providers = new Set(user?.accounts.map((a) => a.provider) ?? []);

  const methods = [
    {
      name: "Email & password",
      detail: hasPassword ? "Sign in with your email and password." : "No password set yet — add one below.",
      on: hasPassword,
      state: hasPassword ? "Enabled" : "Not set",
      href: hasPassword ? undefined : "#security",
    },
    {
      name: "Email code",
      detail: `A one-time code sent to ${session.user.email}.`,
      on: true,
      state: "Available",
    },
    {
      name: "Google",
      detail: providers.has("google")
        ? "Your Google account is linked."
        : "Sign in with Google once to link it.",
      on: providers.has("google"),
      state: providers.has("google") ? "Connected" : "Not linked",
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.kicker}>01 / System preferences</p>
        <h1>Settings</h1>
        <p className={styles.sub}>Security, sign-in methods and account activity.</p>
      </header>

      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Settings sections">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.label}
            </a>
          ))}
        </nav>

        <div className={styles.content}>
          <section id="security" className={styles.panel} aria-labelledby="security-title">
            <div className={styles.panelHead}>
              <div>
                <h2 id="security-title">Password</h2>
                <p>{hasPassword ? "Change the password you sign in with." : "Set a password to enable email & password sign-in."}</p>
              </div>
              <span className={styles.chip} data-on={hasPassword}>
                {hasPassword ? "Password set" : "Not set"}
              </span>
            </div>
            <PasswordChangeForm hasPassword={hasPassword} />
          </section>

          <section id="methods" className={styles.panel} aria-labelledby="methods-title">
            <div className={styles.panelHead}>
              <div>
                <h2 id="methods-title">Sign-in methods</h2>
                <p>Every way you can get into your ASafarIM account.</p>
              </div>
            </div>
            <ul className={styles.rows}>
              {methods.map((method) => (
                <li key={method.name} className={styles.row}>
                  <span className={styles.rowIcon} data-on={method.on} aria-hidden="true">
                    {method.on ? "✓" : "–"}
                  </span>
                  <div className={styles.rowText}>
                    <strong>{method.name}</strong>
                    <span>{method.detail}</span>
                  </div>
                  {method.href ? (
                    <a href={method.href} className={styles.chip} data-on={method.on}>
                      {method.state}
                    </a>
                  ) : (
                    <span className={styles.chip} data-on={method.on}>
                      {method.state}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section id="activity" className={`${styles.panel} ${styles.full}`} aria-labelledby="activity-title">
            <div className={styles.panelHead}>
              <div>
                <h2 id="activity-title">Recent sign-ins</h2>
                <p>Your last {signIns.length || 10} sign-ins. Don’t recognise one? Change your password.</p>
              </div>
            </div>
            {signIns.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Device</th>
                      <th scope="col">Method</th>
                      <th scope="col">Network</th>
                      <th scope="col">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signIns.map((event, i) => (
                      <tr key={event.id}>
                        <td>
                          <span className={styles.device}>
                            {i === 0 && <span className={styles.live} title="Most recent" />}
                            {event.device}
                          </span>
                        </td>
                        <td>{event.provider}</td>
                        <td className={styles.mono}>{event.ip ?? "—"}</td>
                        <td>
                          <time dateTime={event.at.toISOString()} title={event.at.toLocaleString("en-GB")}>
                            {timeAgo(event.at, now)}
                          </time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.empty}>No sign-ins recorded yet.</p>
            )}
          </section>

          <section id="planned" className={`${styles.panel} ${styles.full}`} aria-labelledby="planned-title">
            <div className={styles.panelHead}>
              <div>
                <h2 id="planned-title">Coming next</h2>
                <p>On the roadmap for this page.</p>
              </div>
            </div>
            <ul className={styles.rows}>
              {PLANNED.map((item) => (
                <li key={item.title} className={styles.row}>
                  <span className={styles.rowIcon} aria-hidden="true">
                    ◷
                  </span>
                  <div className={styles.rowText}>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </div>
                  <span className={styles.chip}>Planned</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
