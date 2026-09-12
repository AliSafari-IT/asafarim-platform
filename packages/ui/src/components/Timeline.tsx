export interface TimelineItem {
  time: string;
  title: string;
  meta?: string;
  /**
   * When set, the title links to the actual thing this entry describes —
   * e.g. the generated timeline or export on the app that made it — so an
   * operator can jump straight to what a user made instead of just reading
   * about it. Opens in a new tab since it's almost always a different app's
   * origin than the console itself.
   */
  href?: string;
}

export interface TimelineProps {
  items: TimelineItem[];
}

/** Vertical event stream — used for audit logs and activity feeds. */
export function Timeline({ items }: TimelineProps) {
  return (
    <ol className="ui-timeline">
      {items.map((item, i) => (
        <li key={`${item.time}-${i}`}>
          <div className="ui-timeline__time">{item.time}</div>
          <div className="ui-timeline__title">
            {item.href ? (
              <a href={item.href} target="_blank" rel="noopener noreferrer" className="ui-timeline__link">
                {item.title} <span aria-hidden="true">↗</span>
              </a>
            ) : (
              item.title
            )}
          </div>
          {item.meta ? <div className="ui-timeline__meta">{item.meta}</div> : null}
        </li>
      ))}
    </ol>
  );
}
