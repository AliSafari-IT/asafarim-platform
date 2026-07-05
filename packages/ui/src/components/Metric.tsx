export interface MetricProps {
  label: string;
  value: string | number;
  hint?: string;
}

/** Compact stat tile with tabular numerals. */
export function Metric({ label, value, hint }: MetricProps) {
  return (
    <div className="ui-metric">
      <div className="ui-metric__label">{label}</div>
      <div className="ui-metric__value">{value}</div>
      {hint ? <div className="ui-metric__hint">{hint}</div> : null}
    </div>
  );
}
