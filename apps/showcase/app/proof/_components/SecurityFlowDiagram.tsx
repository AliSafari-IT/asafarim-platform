/**
 * The mechanism behind "single sign-on, shared cookie" and "RBAC is checked
 * server-side, per app" in ../data.ts's SECURITY_BOUNDARIES — not just
 * those two sentences restated as boxes. Shows where the session actually
 * gets minted, where the cookie's trust boundary sits (the shared apex
 * domain), and that permission checks re-run server-side on every request
 * rather than being trusted from a client-held flag.
 */
export function SecurityFlowDiagram() {
  const lanes = [
    { x: 90, label: "Browser" },
    { x: 330, label: "App" },
    { x: 570, label: "Hub" },
    { x: 800, label: "Shared DB" },
  ];

  const steps: Array<{
    from: number;
    to: number;
    y: number;
    label: string;
    dashed?: boolean;
    accent?: boolean;
  }> = [
    { from: 0, to: 1, y: 70, label: "GET /dashboard" },
    { from: 1, to: 0, y: 110, label: "302 → hub.* (no session)", dashed: true },
    { from: 0, to: 2, y: 150, label: "sign in" },
    { from: 2, to: 3, y: 190, label: "verify credentials, load roles" },
    { from: 2, to: 0, y: 230, label: "302 + Set-Cookie(JWT), domain=.asafarim.com", accent: true },
    { from: 0, to: 1, y: 270, label: "GET /dashboard + cookie" },
    { from: 1, to: 3, y: 310, label: "check permission — every request, server-side", accent: true },
    { from: 1, to: 0, y: 350, label: "200 OK" },
  ];

  const laneTop = 40;
  const laneBottom = 380;

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox="0 0 900 410"
        role="img"
        aria-label="Sequence: an unauthenticated request to an app redirects the browser to Hub, which verifies credentials against the shared database and sets a JWT cookie scoped to the shared apex domain. The browser resends the cookie to the app, which re-checks the permission against the shared database on every request rather than trusting a client-held role."
        style={{ width: "100%", height: "auto", color: "var(--ink)" }}
      >
        <defs>
          <marker id="proof-arrow-2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>

        {lanes.map((lane) => (
          <g key={lane.label}>
            <line x1={lane.x} y1={laneTop} x2={lane.x} y2={laneBottom} stroke="currentColor" strokeWidth="1" opacity="0.25" />
            <rect x={lane.x - 45} y={8} width="90" height="26" rx="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <text x={lane.x} y={25} textAnchor="middle" fontSize="12">{lane.label}</text>
          </g>
        ))}

        {steps.map((step, i) => {
          const x1 = lanes[step.from].x;
          const x2 = lanes[step.to].x;
          const color = step.accent ? "var(--accent)" : "currentColor";
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={step.y}
                x2={x2}
                y2={step.y}
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray={step.dashed ? "4 3" : undefined}
                markerEnd="url(#proof-arrow-2)"
              />
              <text
                x={(x1 + x2) / 2}
                y={step.y - 6}
                textAnchor="middle"
                fontSize="10"
                fill={color}
                opacity={step.accent ? 1 : 0.8}
              >
                {step.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption style={{ marginTop: "var(--space-2)", fontSize: "0.8125rem", color: "var(--muted)" }}>
        The two highlighted hops are the actual security boundary: the cookie is scoped to the shared domain (not
        a token any single app controls), and the permission check re-runs against the shared database on every
        request — a role never travels as a trusted client-side flag.
      </figcaption>
    </figure>
  );
}
