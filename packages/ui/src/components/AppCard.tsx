export interface AppCardProps {
  name: string;
  description: string;
  /** Destination — omit (with disabled) for coming-soon tiles. */
  href?: string;
  /** Short monospace glyph shown in the tool chip, e.g. "WB". */
  glyph: string;
  /** Technical meta line, e.g. "asafarim.com". */
  meta?: string;
  /** Renders a non-interactive coming-soon tile instead of a link. */
  disabled?: boolean;
}

/** Launcher tile — an app presented as a tool on the workbench. */
export function AppCard({
  name,
  description,
  href,
  glyph,
  meta,
  disabled = false,
}: AppCardProps) {
  const body = (
    <>
      <span className="ui-appcard__glyph" aria-hidden="true">
        {glyph}
      </span>
      <h3>{name}</h3>
      <p>{description}</p>
      <div className="ui-appcard__meta">
        <span>{meta}</span>
        {disabled ? (
          <span className="ui-appcard__soon">coming soon</span>
        ) : (
          <span className="ui-appcard__arrow" aria-hidden="true">
            →
          </span>
        )}
      </div>
    </>
  );

  if (disabled || !href) {
    return <div className="ui-appcard ui-appcard--disabled">{body}</div>;
  }

  return (
    <a href={href} className="ui-appcard">
      {body}
    </a>
  );
}
