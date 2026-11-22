"use client";

import { useId } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Button } from "@asafarim/ui";
import {
  describeDays,
  MAX_WINDOWS,
  parseContactPreferences,
  renderContactParagraph,
  WEEKDAYS,
  type ContactPreferences,
  type OutsideHours,
  type TimeWindow,
  type Weekday,
} from "../../lib/contactPreferences/contract";
import { outputLanguageFromLocale, type OutputLanguage } from "../../lib/tailoring/language";

/**
 * The editor for one set of contact preferences (#940), used for the saved
 * defaults on the profile page and for one email in the composer. It holds
 * no state of its own: the parent owns `value`. The preview is the exact
 * paragraph the email gets, built by the same code.
 */

const TIME_ZONES = [
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/Luxembourg",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/London",
  "UTC",
];

const NEW_WINDOW: TimeWindow = { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };

export function contactPreferencesProblem(value: ContactPreferences): string | null {
  const parsed = parseContactPreferences(value);
  return parsed.ok ? null : parsed.error;
}

function WindowList({
  windows,
  onChange,
  addLabel,
  testId,
  disabled,
}: {
  windows: TimeWindow[];
  onChange: (next: TimeWindow[]) => void;
  addLabel: string;
  testId: string;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  const language = outputLanguageFromLocale(locale);
  const base = useId();
  const set = (index: number, patch: Partial<TimeWindow>) => onChange(windows.map((w, i) => (i === index ? { ...w, ...patch } : w)));
  return (
    <div className="rm-contact__windows" data-testid={testId}>
      {windows.map((window, index) => (
        <fieldset key={index} className="rm-contact__window" disabled={disabled}>
          <legend className="rm-contact__days-legend">{t("resumatch.contact.window.days")}</legend>
          <div className="rm-contact__days">
            {WEEKDAYS.map((day) => (
              <label key={day} className="rm-contact__day">
                <input
                  type="checkbox"
                  checked={window.days.includes(day)}
                  onChange={(e) =>
                    set(index, {
                      days: e.target.checked ? ([...window.days, day].sort((a, b) => a - b) as Weekday[]) : window.days.filter((d) => d !== day),
                    })
                  }
                />
                <span>{describeDays([day], language).replace(/^le /, "")}</span>
              </label>
            ))}
          </div>
          <div className="rm-contact__times">
            <label className="jm-field" htmlFor={`${base}-${index}-from`}>
              <span>{t("resumatch.contact.window.from")}</span>
              <input id={`${base}-${index}-from`} className="ui-input" type="time" step={60} value={window.start} onChange={(e) => set(index, { start: e.target.value })} />
            </label>
            <label className="jm-field" htmlFor={`${base}-${index}-to`}>
              <span>{t("resumatch.contact.window.to")}</span>
              <input id={`${base}-${index}-to`} className="ui-input" type="time" step={60} value={window.end} onChange={(e) => set(index, { end: e.target.value })} />
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(windows.filter((_, i) => i !== index))}>
              {t("resumatch.contact.window.remove")}
            </Button>
          </div>
        </fieldset>
      ))}
      {windows.length < MAX_WINDOWS ? (
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange([...windows, { ...NEW_WINDOW, days: [...NEW_WINDOW.days] }])}>
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ContactPreferencesFields({
  value,
  onChange,
  previewLanguage,
  disabled,
}: {
  value: ContactPreferences;
  onChange: (next: ContactPreferences) => void;
  /** The language the preview is written in; the page's language when left out. */
  previewLanguage?: OutputLanguage;
  disabled?: boolean;
}) {
  const { t, locale } = useTranslation();
  const ids = { zone: useId(), outside: useId(), preview: useId() };
  const language = previewLanguage ?? outputLanguageFromLocale(locale);
  const problem = contactPreferencesProblem(value);
  const paragraph = problem ? null : renderContactParagraph(value, language);
  const zones = TIME_ZONES.includes(value.timeZone) ? TIME_ZONES : [value.timeZone, ...TIME_ZONES];
  const setOutside = (outsideHours: OutsideHours) =>
    onChange({
      ...value,
      outsideHours,
      unavailable: outsideHours === "unavailable" && value.unavailable.length === 0 ? [{ ...NEW_WINDOW, days: [...NEW_WINDOW.days] }] : value.unavailable,
    });

  return (
    <div className="rm-contact__fields" data-testid="contact-preferences-fields">
      <fieldset className="rm-contact__group" disabled={disabled}>
        <legend>{t("resumatch.contact.calls")}</legend>
        <small>{t("resumatch.contact.calls.hint")}</small>
        <WindowList
          windows={value.callWindows}
          onChange={(callWindows) => onChange({ ...value, callWindows })}
          addLabel={t("resumatch.contact.window.addCall")}
          testId="contact-call-windows"
          disabled={disabled}
        />
      </fieldset>

      <label className="jm-field" htmlFor={ids.zone}>
        <span>{t("resumatch.contact.timeZone")}</span>
        <select id={ids.zone} className="ui-input ui-select" value={value.timeZone} disabled={disabled} onChange={(e) => onChange({ ...value, timeZone: e.target.value })}>
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="rm-contact__group" disabled={disabled}>
        <legend>{t("resumatch.contact.outside")}</legend>
        {(["none", "arrange", "unavailable"] as const).map((option) => (
          <label key={option} className="rm-contact__radio">
            <input type="radio" name={ids.outside} checked={value.outsideHours === option} onChange={() => setOutside(option)} />
            <span>{t(`resumatch.contact.outside.${option}`)}</span>
          </label>
        ))}
        {value.outsideHours === "unavailable" ? (
          <WindowList
            windows={value.unavailable}
            onChange={(unavailable) => onChange({ ...value, unavailable })}
            addLabel={t("resumatch.contact.window.addUnavailable")}
            testId="contact-unavailable-windows"
            disabled={disabled}
          />
        ) : null}
      </fieldset>

      <fieldset className="rm-contact__group" disabled={disabled}>
        <legend>{t("resumatch.contact.messages")}</legend>
        <label className="rm-contact__radio">
          <input type="checkbox" checked={value.email} onChange={(e) => onChange({ ...value, email: e.target.checked })} />
          <span>{t("resumatch.contact.messages.email")}</span>
        </label>
        <label className="rm-contact__radio">
          <input type="checkbox" checked={value.whatsapp} onChange={(e) => onChange({ ...value, whatsapp: e.target.checked })} />
          <span>{t("resumatch.contact.messages.whatsapp")}</span>
        </label>
        <small>{t("resumatch.contact.messages.hint")}</small>
      </fieldset>

      {problem ? (
        <p className="rm-field-error" role="alert" data-testid="contact-problem">
          {t(`resumatch.contact.error.${problem}`)}
        </p>
      ) : null}

      <div className="rm-contact__preview" aria-labelledby={ids.preview} aria-live="polite">
        <span id={ids.preview} className="rm-contact__preview-label">
          {t("resumatch.contact.preview")}
        </span>
        <p data-testid="contact-preview">{paragraph ?? (problem ? "" : t("resumatch.contact.preview.empty"))}</p>
      </div>
    </div>
  );
}
