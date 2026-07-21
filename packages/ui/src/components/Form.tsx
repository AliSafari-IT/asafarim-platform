import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="ui-formrow">{children}</div>;
}

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className="ui-label" {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ui-input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="ui-input" rows={4} {...props} />;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
}

/** A styled native `<select>` — keyboard/screen-reader behavior stays exactly what browsers already do well; only the chrome is themed. */
export function Select({ options, className, ...props }: SelectProps) {
  const classes = ["ui-input", "ui-select", className].filter(Boolean).join(" ");
  return (
    <select className={classes} {...props}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Short helper/description text under a form field — associate via `aria-describedby`. */
export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="ui-hint">
      {children}
    </p>
  );
}

/** A field-level validation message — associate via `aria-describedby` and pair with `aria-invalid` on the control. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="ui-field-error" role="alert">
      {children}
    </p>
  );
}

/**
 * A validation summary listing every field error, with anchor links to each
 * field (by id) — the accessible pattern for "here's everything wrong with
 * your submission" that screen-reader users can jump straight from.
 */
export function ValidationSummary({
  errors,
}: {
  errors: { fieldId: string; label: string; messages: string[] }[];
}) {
  if (errors.length === 0) return null;
  return (
    <div className="ui-alert ui-alert--error" role="alert" aria-live="assertive">
      <p style={{ marginTop: 0, fontWeight: 600 }}>
        Please fix the following before continuing:
      </p>
      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
        {errors.map((error) =>
          error.messages.map((message, index) => (
            <li key={`${error.fieldId}-${index}`}>
              <a href={`#${error.fieldId}`}>{error.label}</a>: {message}
            </li>
          )),
        )}
      </ul>
    </div>
  );
}
