"use client";

import { useId, useMemo } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { timeZoneOptions } from "../../lib/applications/zonedTime";

export interface ZonedValue {
  /** `YYYY-MM-DDTHH:mm`, as the input holds it. */
  local: string;
  timeZone: string;
}

/**
 * A date and time with its time zone shown beside it (application-
 * timeline.md). The server turns the pair into UTC; the zone is kept so
 * the entry shows this same wall-clock time later.
 */
export function ZonedDateTimeField({
  label,
  value,
  onChange,
  hint,
  error,
  testId,
  optional = false,
}: {
  label: string;
  value: ZonedValue;
  onChange: (value: ZonedValue) => void;
  hint?: string;
  error?: string | null;
  testId: string;
  optional?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const zones = useMemo(() => timeZoneOptions(value.timeZone), [value.timeZone]);
  return (
    <fieldset className="rm-tl-zoned" data-testid={testId}>
      <legend>
        {label}
        {optional ? <span className="rm-tl-optional"> {t("resumatch.tl.optional")}</span> : null}
      </legend>
      <div className="rm-tl-zoned__row">
        <label className="jm-field">
          <span>{t("resumatch.tl.zoned.dateTime")}</span>
          <input
            className="ui-input"
            type="datetime-local"
            value={value.local}
            onChange={(e) => onChange({ ...value, local: e.target.value })}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-zone ${error ? `${id}-error` : ""}`.trim()}
            data-testid={`${testId}-local`}
          />
        </label>
        <label className="jm-field">
          <span>{t("resumatch.tl.zoned.timeZone")}</span>
          <select
            className="ui-input"
            value={value.timeZone}
            onChange={(e) => onChange({ ...value, timeZone: e.target.value })}
            data-testid={`${testId}-zone`}
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="rm-tl-hint" id={`${id}-zone`}>
        {t("resumatch.tl.zoned.shownIn", { zone: value.timeZone.replace(/_/g, " ") })}
        {hint ? ` ${hint}` : ""}
      </p>
      {error ? (
        <p className="rm-field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
