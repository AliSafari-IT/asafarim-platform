import nodemailer, { type Transporter } from "nodemailer";
import { getSettingOverrides, type SettingValue } from "@asafarim/db";

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value == null || value.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

/** Admin-console keys (packages/db/src/settings.ts, "email" group). */
export const SMTP_SETTING_KEYS = {
  host: "email.smtp.host",
  port: "email.smtp.port",
  secure: "email.smtp.secure",
  user: "email.smtp.user",
  password: "email.smtp.password",
  from: "email.smtp.from",
  replyTo: "email.smtp.replyTo",
} as const;

type SmtpField = keyof typeof SMTP_SETTING_KEYS;
export type SmtpSource = "settings" | "env";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  secure: boolean;
  requireTls: boolean;
  bcc?: string;
  replyTo?: string;
  /** Where each console-manageable field was resolved from. Never the values. */
  sources: Record<SmtpField, SmtpSource>;
}

/**
 * Admin overrides for the SMTP keys. If the settings store can't be read,
 * mail must keep flowing exactly as before, so this degrades to "no
 * overrides" (pure env) rather than failing the send.
 */
async function loadOverrides(): Promise<Map<string, SettingValue>> {
  try {
    return await getSettingOverrides(Object.values(SMTP_SETTING_KEYS));
  } catch (error) {
    console.warn(
      "[mailer] platform settings unavailable, using SMTP_* env vars:",
      error instanceof Error ? error.message : error,
    );
    return new Map();
  }
}

/**
 * Resolves the SMTP relay: each field is an admin-console override when one
 * is set, otherwise its SMTP_* env var — per field, so an admin can fix just
 * the From address without re-entering the rest. With no overrides this is
 * exactly the old env-only behavior. SMTP_REQUIRE_TLS and SMTP_BCC remain
 * env-only.
 */
export async function getSmtpConfig(): Promise<SmtpConfig> {
  const overrides = await loadOverrides();
  const sources = {} as Record<SmtpField, SmtpSource>;

  // A blank string override counts as unset, so clearing a field in the
  // console can never blank out a working env value.
  function str(field: SmtpField, envValue: string | undefined): string | undefined {
    const value = overrides.get(SMTP_SETTING_KEYS[field]);
    if (typeof value === "string" && value.trim() !== "") {
      sources[field] = "settings";
      return value.trim();
    }
    sources[field] = "env";
    return envValue || undefined;
  }
  function num(field: SmtpField, envValue: number): number {
    const value = overrides.get(SMTP_SETTING_KEYS[field]);
    sources[field] = typeof value === "number" ? "settings" : "env";
    return typeof value === "number" ? value : envValue;
  }
  function bool(field: SmtpField, envValue: boolean): boolean {
    const value = overrides.get(SMTP_SETTING_KEYS[field]);
    sources[field] = typeof value === "boolean" ? "settings" : "env";
    return typeof value === "boolean" ? value : envValue;
  }

  const host = str("host", process.env.SMTP_HOST);
  const port = num("port", Number(process.env.SMTP_PORT ?? "465"));
  const secure = bool("secure", parseBoolean(process.env.SMTP_SECURE, true));
  const user = str("user", process.env.SMTP_USER);
  const password = str("password", process.env.SMTP_PASSWORD);
  const from = str("from", process.env.SMTP_FROM);
  const replyTo = str("replyTo", undefined);

  if (!host || !user || !password || !from) {
    throw new Error(
      "SMTP configuration is incomplete. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM (or their Email settings in the admin console).",
    );
  }

  return {
    host,
    port,
    user,
    password,
    from,
    secure,
    requireTls: parseBoolean(process.env.SMTP_REQUIRE_TLS, false),
    bcc: process.env.SMTP_BCC || undefined,
    replyTo,
    sources,
  };
}

/**
 * Creates a nodemailer transport from the resolved SMTP config. `timeoutMs`
 * caps connect/greeting/socket waits for interactive callers (the admin
 * console's test send); real mail keeps nodemailer's defaults.
 */
export async function createTransport(options: { timeoutMs?: number } = {}): Promise<{
  transporter: Transporter;
  from: string;
  bcc?: string;
  config: SmtpConfig;
}> {
  const config = await getSmtpConfig();
  const timeouts = options.timeoutMs
    ? {
        connectionTimeout: options.timeoutMs,
        greetingTimeout: options.timeoutMs,
        socketTimeout: options.timeoutMs,
      }
    : {};
  const transporter = nodemailer.createTransport(
    {
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      requireTLS: config.requireTls,
      ...timeouts,
    },
    // A transport-level default: a message that sets its own replyTo (the
    // contact form replies to the visitor) keeps it.
    config.replyTo ? { replyTo: config.replyTo } : undefined,
  );
  return { transporter, from: config.from, bcc: config.bcc, config };
}
