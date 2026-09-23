import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({ getSettingOverrides: vi.fn() }));

import { getSettingOverrides } from "@asafarim/db";
import { createTransport, getSmtpConfig } from "./mailer";

const ENV = {
  SMTP_HOST: "env.smtp.example",
  SMTP_PORT: "587",
  SMTP_SECURE: "false",
  SMTP_USER: "env-user",
  SMTP_PASSWORD: "env-password",
  SMTP_FROM: "Env <env@example.com>",
};
const saved = { ...process.env };

function overrides(entries: Record<string, unknown>) {
  vi.mocked(getSettingOverrides).mockResolvedValue(new Map(Object.entries(entries)) as never);
}

beforeEach(() => {
  Object.assign(process.env, ENV);
  delete process.env.SMTP_REQUIRE_TLS;
  delete process.env.SMTP_BCC;
  overrides({});
});
afterEach(() => {
  process.env = { ...saved };
});

describe("getSmtpConfig", () => {
  it("with no settings rows, is exactly the env-only config (Hub OTP path unchanged)", async () => {
    const config = await getSmtpConfig();
    expect(config).toMatchObject({
      host: "env.smtp.example",
      port: 587,
      secure: false,
      user: "env-user",
      password: "env-password",
      from: "Env <env@example.com>",
      requireTls: false,
      replyTo: undefined,
    });
    expect(Object.values(config.sources).every((s) => s === "env")).toBe(true);
  });

  it("an override wins per field; untouched fields keep their env value", async () => {
    overrides({ "email.smtp.from": "Console <noreply@asafarim.com>" });
    const config = await getSmtpConfig();
    expect(config.from).toBe("Console <noreply@asafarim.com>");
    expect(config.host).toBe("env.smtp.example");
    expect(config.password).toBe("env-password");
    expect(config.sources.from).toBe("settings");
    expect(config.sources.host).toBe("env");
  });

  it("applies every overridden field, including the (already decrypted) secret password", async () => {
    overrides({
      "email.smtp.host": "console.smtp.example",
      "email.smtp.port": 465,
      "email.smtp.secure": true,
      "email.smtp.user": "console-user",
      "email.smtp.password": "console-password",
      "email.smtp.replyTo": "support@asafarim.com",
    });
    const config = await getSmtpConfig();
    expect(config).toMatchObject({
      host: "console.smtp.example",
      port: 465,
      secure: true,
      user: "console-user",
      password: "console-password",
      replyTo: "support@asafarim.com",
    });
  });

  it("treats a blank string override as unset, so it can't blank out env", async () => {
    overrides({ "email.smtp.host": "   ", "email.smtp.replyTo": "" });
    const config = await getSmtpConfig();
    expect(config.host).toBe("env.smtp.example");
    expect(config.replyTo).toBeUndefined();
  });

  it("an override of false/0-like values still wins over env", async () => {
    process.env.SMTP_SECURE = "true";
    overrides({ "email.smtp.secure": false });
    expect((await getSmtpConfig()).secure).toBe(false);
  });

  it("falls back to pure env when the settings store is unreachable", async () => {
    vi.mocked(getSettingOverrides).mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const config = await getSmtpConfig();
    expect(config.host).toBe("env.smtp.example");
    expect(config.password).toBe("env-password");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("still throws the incomplete-config error when neither source provides a required field", async () => {
    delete process.env.SMTP_PASSWORD;
    await expect(getSmtpConfig()).rejects.toThrow(/SMTP configuration is incomplete/);
  });

  it("a console password alone can complete an env config that lacks one", async () => {
    delete process.env.SMTP_PASSWORD;
    overrides({ "email.smtp.password": "console-password" });
    expect((await getSmtpConfig()).password).toBe("console-password");
  });
});

describe("createTransport", () => {
  it("builds the transport from the resolved config with a replyTo default", async () => {
    overrides({ "email.smtp.replyTo": "support@asafarim.com" });
    const { transporter, from } = await createTransport();
    const options = (transporter as unknown as { options: Record<string, unknown> }).options;
    expect(options).toMatchObject({ host: "env.smtp.example", port: 587, secure: false });
    expect((options.auth as { user: string }).user).toBe("env-user");
    expect((transporter as unknown as { _defaults: Record<string, unknown> })._defaults).toMatchObject({
      replyTo: "support@asafarim.com",
    });
    expect(from).toBe("Env <env@example.com>");
  });
});
