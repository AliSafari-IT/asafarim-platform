import "server-only";

/**
 * Configuration for sending application emails (send-application.md).
 * Read from process.env at call time, never cached, and never echoed: an
 * error names a variable, not its value.
 *
 * `RESUMATCH_EMAIL_TRANSPORT`:
 * - `smtp`: the platform relay. Each RESUMATCH_SMTP_* falls back to the
 *   platform's SMTP_* variable, so the one relay @asafarim/auth already
 *   uses works with no extra secret. SMTP_BCC is deliberately NOT honoured:
 *   a candidate's application must never be copied to the platform owner.
 * - `fixture`: no network. Accepts every message, except the reserved
 *   test recipients in mailer.ts. Local development, tests and CI only;
 *   refused in production.
 * - unset / `disabled`: drafts work, Send explains that sending is not set
 *   up. The safe default for a deploy that has not configured a sender.
 *
 * The sender is always the platform's verified address
 * (`RESUMATCH_EMAIL_FROM_ADDRESS`), with the candidate's name as the
 * display name ("Ali Safari via ResuMatch"), and Reply-To set to the
 * candidate's account address. ResuMatch never puts the candidate's own
 * address in From: that would be impersonation, and receiving servers
 * reject it under DMARC anyway.
 */

export type EmailTransportKind = "smtp" | "fixture" | "disabled";

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  user: string;
  password: string;
}

export interface ApplicationEmailConfig {
  transport: EmailTransportKind;
  /** Why sending is unavailable, as a stable code; null when it works. */
  unavailableReason: "disabled" | "incomplete" | "fixture_in_production" | null;
  fromAddress: string | null;
  /** Appended to the candidate's name in From, e.g. "via ResuMatch". */
  fromNameSuffix: string;
  /** Domain for Message-ID headers. */
  messageIdDomain: string;
  dailyLimit: number;
  timeoutMs: number;
  smtp: SmtpSettings | null;
}

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_TIMEOUT_MS = 30_000;

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && value !== "" && Number.isInteger(n) && n >= 0 ? n : fallback;
}

/** A bare address from "Name <a@b>" or "a@b". */
function bareAddress(value: string | undefined): string | null {
  if (!value) return null;
  const match = /<([^<>\s]+@[^<>\s]+)>/.exec(value);
  const address = (match ? match[1] : value).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? address : null;
}

export function getApplicationEmailConfig(env: NodeJS.ProcessEnv = process.env): ApplicationEmailConfig {
  const raw = (env.RESUMATCH_EMAIL_TRANSPORT ?? "disabled").trim().toLowerCase();
  const transport: EmailTransportKind = raw === "smtp" || raw === "fixture" ? raw : "disabled";
  const fromAddress = bareAddress(env.RESUMATCH_EMAIL_FROM_ADDRESS) ?? (transport === "fixture" ? "applications@resumatch.test" : null);
  const base = {
    transport,
    fromAddress,
    fromNameSuffix: (env.RESUMATCH_EMAIL_FROM_NAME_SUFFIX ?? "via ResuMatch").trim(),
    messageIdDomain: fromAddress?.split("@")[1] ?? "resumatch.asafarim.com",
    dailyLimit: positiveInt(env.RESUMATCH_EMAIL_DAILY_LIMIT, DEFAULT_DAILY_LIMIT),
    timeoutMs: positiveInt(env.RESUMATCH_EMAIL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };

  if (transport === "disabled") return { ...base, unavailableReason: "disabled", smtp: null };
  if (transport === "fixture") {
    const production = env.NODE_ENV === "production" && env.RESUMATCH_EMAIL_ALLOW_FIXTURE !== "true";
    return { ...base, unavailableReason: production ? "fixture_in_production" : null, smtp: null };
  }

  const host = env.RESUMATCH_SMTP_HOST || env.SMTP_HOST;
  const user = env.RESUMATCH_SMTP_USER || env.SMTP_USER;
  const password = env.RESUMATCH_SMTP_PASSWORD || env.SMTP_PASSWORD;
  const port = positiveInt(env.RESUMATCH_SMTP_PORT || env.SMTP_PORT, 465);
  if (!host || !user || !password || !fromAddress) {
    return { ...base, unavailableReason: "incomplete", smtp: null };
  }
  return {
    ...base,
    unavailableReason: null,
    smtp: {
      host,
      port,
      user,
      password,
      secure: bool(env.RESUMATCH_SMTP_SECURE ?? env.SMTP_SECURE, port === 465),
      requireTls: bool(env.RESUMATCH_SMTP_REQUIRE_TLS ?? env.SMTP_REQUIRE_TLS, false),
    },
  };
}

/** "Ali Safari via ResuMatch" — the display name, never an address. */
export function senderDisplayName(fullName: string | null, config: Pick<ApplicationEmailConfig, "fromNameSuffix">): string {
  const name = (fullName ?? "").replace(/[\r\n"<>]/g, " ").replace(/\s+/g, " ").trim();
  const suffix = config.fromNameSuffix;
  if (!name) return suffix.replace(/^via\s+/i, "") || "ResuMatch";
  return suffix ? `${name} ${suffix}` : name;
}
