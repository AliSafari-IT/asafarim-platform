export interface TimelineItem {
  time: string;
  title: string;
  meta?: string;
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
          <div className="ui-timeline__title">{item.title}</div>
          {item.meta ? <div className="ui-timeline__meta">{item.meta}</div> : null}
        </li>
      ))}
    </ol>
  );
}
