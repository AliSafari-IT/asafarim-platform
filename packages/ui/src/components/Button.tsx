import type { ButtonHTMLAttributes, CSSProperties } from "react";

const buttonStyle: CSSProperties = {
  padding: "0.6rem 1.4rem",
  borderRadius: "0.5rem",
  border: "none",
  backgroundColor: "#0ea5e9",
  color: "#f8fafc",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ style, ...props }: ButtonProps) {
  return <button style={{ ...buttonStyle, ...style }} {...props} />;
}
