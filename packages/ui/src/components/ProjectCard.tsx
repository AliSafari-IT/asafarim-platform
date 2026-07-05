import { Badge } from "./Badge";
import { StatusBadge, type Status } from "./StatusBadge";

export interface ProjectCardProps {
  title: string;
  summary: string;
  href: string;
  tags?: string[];
  status?: Status;
  /** Gallery index label, e.g. "01". */
  index?: string;
  /** Short monospace glyph in the frame, e.g. "TM". */
  glyph?: string;
}

/** Gallery piece — a project presented as an exhibit. */
export function ProjectCard({
  title,
  summary,
  href,
  tags = [],
  status,
  index,
  glyph,
}: ProjectCardProps) {
  return (
    <a href={href} className="ui-projectcard">
      <div className="ui-projectcard__frame" aria-hidden="true">
        <span>{glyph ?? title.slice(0, 2).toUpperCase()}</span>
      </div>
      <div className="ui-projectcard__body">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {index ? <span className="ui-projectcard__index">№ {index}</span> : <span />}
          {status ? <StatusBadge status={status} /> : null}
        </div>
        <h3>{title}</h3>
        <p>{summary}</p>
        <div className="ui-projectcard__tags">
          {tags.map((tag) => (
            <Badge key={tag} tone="info">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
    </a>
  );
}
