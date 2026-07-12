"use client";

import { useState } from "react";
import { FormRow, Input, Label } from "@asafarim/ui";
import styles from "./password-field.module.css";

/** Password input with a show/hide toggle. Shared by sign-in and sign-up. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <FormRow>
      <Label htmlFor={id}>{label}</Label>
      <div className={styles.row}>
        <Input
          id={id}
          type={show ? "text" : "password"}
          required={required}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ paddingRight: "3.2rem" }}
        />
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </FormRow>
  );
}
