import type { CSSProperties, ReactNode } from "react";

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  backgroundColor: "#0b1120",
  color: "#e2e8f0",
};

const headerStyle: CSSProperties = {
  padding: "0.75rem 2rem",
  borderBottom: "1px solid #1e293b",
  display: "flex",
  alignItems: "center",
  gap: "1.5rem",
  flexWrap: "wrap",
};

const bodyStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  alignItems: "stretch",
};

const mainStyle: CSSProperties = {
  flex: 1,
  padding: "2rem",
  maxWidth: "72rem",
  width: "100%",
  margin: "0 auto",
};

const footerStyle: CSSProperties = {
  padding: "1rem 2rem",
  borderTop: "1px solid #1e293b",
  fontSize: "0.85rem",
  color: "#64748b",
};

export interface AppShellProps {
  appName: string;
  /** Top navigation, usually a <TopNav />. */
  nav?: ReactNode;
  /** Right side of the header, usually a <UserMenu /> or sign-in link. */
  user?: ReactNode;
  /** Optional sidebar, usually a <SideNav />. */
  sideNav?: ReactNode;
  children: ReactNode;
}

export function AppShell({ appName, nav, user, sideNav, children }: AppShellProps) {
  return (
    <div style={shellStyle}>
      <header style={headerStyle}>
        <span style={{ display: "flex", alignItems: "baseline", gap: "0.6rem" }}>
          <strong style={{ fontSize: "1.05rem", whiteSpace: "nowrap" }}>
            ASafarIM Digital
          </strong>
          <span style={{ color: "#38bdf8", whiteSpace: "nowrap" }}>{appName}</span>
        </span>
        <div style={{ flex: 1 }}>{nav}</div>
        {user ? <div>{user}</div> : null}
      </header>
      <div style={bodyStyle}>
        {sideNav ? (
          <aside
            style={{
              width: "14rem",
              borderRight: "1px solid #1e293b",
              padding: "1.5rem 1rem",
            }}
          >
            {sideNav}
          </aside>
        ) : null}
        <main style={mainStyle}>{children}</main>
      </div>
      <footer style={footerStyle}>
        ASafarIM Platform &mdash; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
