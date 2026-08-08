"use client";

import { useActionState } from "react";
import { Mail } from "./icons";
import { subscribeToNewsletter } from "./newsletter-actions";
import styles from "../page.module.css";

export function NewsletterSignup({
  kicker,
  heading,
  body,
  incentive,
  placeholder,
  cta,
  pendingCta,
  successMessage,
}: {
  kicker: string;
  heading: string;
  body: string;
  incentive: string;
  placeholder: string;
  cta: string;
  pendingCta: string;
  successMessage: string;
}) {
  const [state, formAction, pending] = useActionState(subscribeToNewsletter, {
    status: "idle",
  });

  return (
    <div className={styles.newsletter} data-reveal>
      <Mail size={28} className={styles.newsletterIcon} />
      <span className={styles.kicker}>{kicker}</span>
      <h2 className={styles.newsletterTitle}>{heading}</h2>
      <p className={styles.newsletterBody}>{body}</p>
      <p className={styles.newsletterIncentive}>{incentive}</p>

      {state.status === "success" ? (
        <p className={styles.newsletterSuccess}>{successMessage}</p>
      ) : (
        <form action={formAction} className={styles.newsletterForm} aria-label={heading}>
          {/* Honeypot — hidden from real visitors via CSS, invisible to
              screen readers via aria-hidden + tabIndex, but bots that fill
              every field will trip it. */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className={styles.newsletterHoneypot}
          />
          <input
            type="email"
            name="email"
            required
            maxLength={200}
            placeholder={placeholder}
            autoComplete="email"
            className={styles.newsletterInput}
          />
          <button type="submit" disabled={pending} className={styles.btnPrimary}>
            {pending ? pendingCta : cta}
          </button>
        </form>
      )}

      {state.status === "error" && (
        <p className={styles.newsletterError}>{state.message}</p>
      )}
    </div>
  );
}
