import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
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
