export interface PlatformMapNode {
  name: string;
  meta?: string;
  href?: string;
}

export interface PlatformMapProps {
  center: PlatformMapNode;
  nodes: PlatformMapNode[];
}

function NodeCard({ name, meta, href }: PlatformMapNode) {
  const body = (
    <>
      <div className="ui-platformmap__node-name">{name}</div>
      {meta ? <div className="ui-platformmap__node-meta">{meta}</div> : null}
    </>
  );

  if (href) {
    return (
      <a href={href} className="ui-platformmap__node ui-platformmap__node--link">
        {body}
      </a>
    );
  }

  return <div className="ui-platformmap__node">{body}</div>;
}

/**
 * Hub-and-spoke system diagram: a shared center (identity/data) connected
 * to every app/door on the platform. Pure CSS, no SVG — stays responsive
 * and overflow-safe by wrapping the spoke row at narrow widths.
 */
export function PlatformMap({ center, nodes }: PlatformMapProps) {
  return (
    <div className="ui-platformmap">
      <div className="ui-platformmap__center">
        <NodeCard {...center} />
      </div>
      <div className="ui-platformmap__stem" aria-hidden="true" />
      <div className="ui-platformmap__spokes">
        {nodes.map((node) => (
          <NodeCard key={node.name} {...node} />
        ))}
      </div>
    </div>
  );
}
