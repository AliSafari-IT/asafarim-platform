export type Status = "live" | "beta" | "planned" | "archived";

export interface StatusBadgeProps {
  status: Status;
}

const labels: Record<Status, string> = {
  live: "Live",
  beta: "Beta",
  planned: "Planned",
  archived: "Archived",
};

/** Technical status chip with an indicator dot. */
export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`ui-status ui-status--${status}`}>
      <span className="ui-status__dot" aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
