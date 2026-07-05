export interface AppCardProps {
  name: string;
  description: string;
  href: string;
  /** Short monospace glyph shown in the tool chip, e.g. "WB". */
  glyph: string;
  /** Technical meta line, e.g. "asafarim.com". */
  meta?: string;
}

/** Launcher tile — an app presented as a tool on the workbench. */
export function AppCard({ name, description, href, glyph, meta }: AppCardProps) {
  return (
    <a href={href} className="ui-appcard">
      <span className="ui-appcard__glyph" aria-hidden="true">
        {glyph}
      </span>
      <h3>{name}</h3>
      <p>{description}</p>
      <div className="ui-appcard__meta">
        <span>{meta}</span>
        <span className="ui-appcard__arrow" aria-hidden="true">
          →
        </span>
      </div>
    </a>
  );
}
