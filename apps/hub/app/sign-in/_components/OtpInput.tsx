import { FormRow, Label } from "@asafarim/ui";
import styles from "./auth.module.css";

export function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <FormRow>
      <Label htmlFor="otp-code">Login code</Label>
      <input
        id="otp-code"
        type="text"
        inputMode="text"
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={6}
        placeholder="A1B2C3"
        aria-label="6-character login code"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
        className={`ui-input ${styles.otpInput}`}
      />
    </FormRow>
  );
}
