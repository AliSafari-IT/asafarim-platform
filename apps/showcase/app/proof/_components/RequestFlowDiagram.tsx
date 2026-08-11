/**
 * What actually happens to a request, not a list of components. The claim
 * this diagram makes: one reverse proxy fronts every app, and the database
 * boundary — not app code — is what actually keeps testora/appbuilder
 * isolated from the shared platform data. Matches DEPLOYMENT_TOPOLOGY and
 * ARCHITECTURE_NODES in ../data.ts; update both together if this drifts.
 */
export function RequestFlowDiagram() {
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox="0 0 860 300"
        role="img"
        aria-label="A browser request passes through one reverse proxy to the matched app, which queries either the shared Postgres database used by seven apps, or an isolated Postgres database used only by testora and appbuilder."
        style={{ width: "100%", height: "auto", color: "var(--ink)" }}
      >
        <defs>
          <marker id="proof-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Browser */}
        <rect x="20" y="110" width="120" height="56" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text x="80" y="143" textAnchor="middle" fontSize="12">Browser</text>

        {/* Reverse proxy */}
        <rect x="200" y="110" width="150" height="56" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text x="275" y="136" textAnchor="middle" fontSize="12">Reverse proxy</text>
        <text x="275" y="152" textAnchor="middle" fontSize="10" opacity="0.7">TLS + subdomain routing</text>

        {/* App */}
        <rect x="410" y="110" width="160" height="56" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text x="490" y="136" textAnchor="middle" fontSize="12">Matched app</text>
        <text x="490" y="152" textAnchor="middle" fontSize="10" opacity="0.7">Next.js, one per product</text>

        {/* Shared DB */}
        <rect x="640" y="30" width="200" height="56" rx="8" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
        <text x="740" y="56" textAnchor="middle" fontSize="12">Shared Postgres</text>
        <text x="740" y="72" textAnchor="middle" fontSize="10" opacity="0.7">Prisma — 7 apps</text>

        {/* Isolated DB */}
        <rect x="640" y="190" width="200" height="56" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
        <text x="740" y="216" textAnchor="middle" fontSize="12">Isolated Postgres</text>
        <text x="740" y="232" textAnchor="middle" fontSize="10" opacity="0.7">Drizzle — testora, appbuilder only</text>

        {/* Arrows */}
        <line x1="140" y1="138" x2="196" y2="138" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#proof-arrow)" />
        <text x="168" y="128" textAnchor="middle" fontSize="10" opacity="0.75">HTTPS</text>

        <line x1="350" y1="138" x2="406" y2="138" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#proof-arrow)" />
        <text x="378" y="128" textAnchor="middle" fontSize="10" opacity="0.75">routes</text>

        <path d="M570,124 L636,58" fill="none" stroke="var(--accent)" strokeWidth="1.5" markerEnd="url(#proof-arrow)" />
        <text x="600" y="80" textAnchor="middle" fontSize="10" fill="var(--accent)">shared apps</text>

        <path d="M570,152 L636,218" fill="none" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#proof-arrow)" />
        <text x="600" y="200" textAnchor="middle" fontSize="10" opacity="0.75">isolated apps, never shared</text>
      </svg>
      <figcaption style={{ marginTop: "var(--space-2)", fontSize: "0.8125rem", color: "var(--muted)" }}>
        Every request crosses the same reverse proxy regardless of which app it reaches. What actually keeps
        testora and appbuilder isolated is that their apps never hold a connection to the shared database — not
        an application-level check.
      </figcaption>
    </figure>
  );
}
