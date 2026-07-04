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
  padding: "1rem 2rem",
  borderBottom: "1px solid #1e293b",
  display: "flex",
  alignItems: "baseline",
  gap: "0.75rem",
};

const mainStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "2rem",
  gap: "1.5rem",
};

const footerStyle: CSSProperties = {
  padding: "1rem 2rem",
  borderTop: "1px solid #1e293b",
  fontSize: "0.85rem",
  color: "#64748b",
};

export interface AppShellProps {
  appName: string;
  children: ReactNode;
}

export function AppShell({ appName, children }: AppShellProps) {
  return (
    <div style={shellStyle}>
      <header style={headerStyle}>
        <strong style={{ fontSize: "1.1rem" }}>ASafarIM Digital</strong>
        <span style={{ color: "#38bdf8" }}>{appName}</span>
      </header>
      <main style={mainStyle}>{children}</main>
      <footer style={footerStyle}>
        ASafarIM Platform &mdash; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
