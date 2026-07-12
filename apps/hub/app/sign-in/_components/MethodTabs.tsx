import styles from "./auth.module.css";

export type SignInMethod = "password" | "email-code";

export function MethodTabs({
  active,
  onChange,
  disabled,
}: {
  active: SignInMethod;
  onChange: (method: SignInMethod) => void;
  disabled: boolean;
}) {
  const methods: Array<{ value: SignInMethod; label: string }> = [
    { value: "password", label: "Password" },
    { value: "email-code", label: "Email code" },
  ];

  return (
    <div className={styles.methodTabs} role="tablist" aria-label="Sign-in method">
      {methods.map((method) => (
        <button
          key={method.value}
          type="button"
          role="tab"
          aria-selected={active === method.value}
          disabled={disabled}
          className={styles.methodTab}
          onClick={() => onChange(method.value)}
        >
          {method.label}
        </button>
      ))}
    </div>
  );
}
