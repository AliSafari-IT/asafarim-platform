import assert from "node:assert/strict";
import { test } from "node:test";
import { hubSsoLoginScript } from "./hub-sso";
import { specEnvPrelude } from "@/test-engine/generators/testGenerator";
import { fixtureOrigin } from "@/test-engine/fixture-origin";

/**
 * Runs the generated Hub SSO snippet against a fake TestCafe `t` (#700): the
 * browser starts wherever the script navigates, and pressing "Sign in" sends
 * it to `landOn` — standing in for wherever Hub actually redirects.
 */
async function runLogin(options: { env: Record<string, string | undefined>; landOn?: string }) {
  const visited: string[] = [];
  let current = new URL("about:blank");
  const expectation = (value: unknown) => ({
    gt: async (n: number, message: string) => {
      if (!((value as number) > n)) throw new Error(message);
    },
    ok: async (message: string) => {
      if (!value) throw new Error(message);
    },
    eql: async (expected: unknown, message: string) => {
      if (value !== expected) throw new Error(message);
    },
  });
  const t = {
    deleteCookies: async () => {},
    navigateTo: async (url: string) => {
      current = new URL(url);
      visited.push(current.href);
    },
    typeText: async () => {},
    click: async () => {
      // Hub honours the callbackUrl unless the test says it goes elsewhere.
      const callback = current.searchParams.get("callbackUrl");
      current = new URL(options.landOn ?? callback ?? current.href);
      visited.push(current.href);
    },
    wait: async () => {},
    eval: async (fn: () => unknown) => {
      const previous = (globalThis as { window?: unknown }).window;
      (globalThis as { window?: unknown }).window = { location: current };
      try {
        return fn();
      } finally {
        (globalThis as { window?: unknown }).window = previous;
      }
    },
    expect: expectation,
  };
  const element = { exists: true, with: () => element, filterVisible: () => element };
  const Selector = () => element;

  const env = { ASAFARIM_ADMIN_EMAIL: "qa@example.test", ASAFARIM_ADMIN_PASSWORD: "x", ...options.env };
  const script = hubSsoLoginScript({
    appName: "TimelineAI",
    appUrlEnv: ["ASAFARIM_TIMELINEAI_URL"],
    defaultAppUrl: "https://tlai.asafarim.com",
    callbackPath: "/dashboard",
  });
  // Same shape a generated spec has: the per-run prelude, then the script.
  const body = `${specEnvPrelude(env)}\nconst console = { log() {} };\n${script}`;
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  await new AsyncFunction("t", "Selector", body)(t, Selector);
  return visited;
}

const LOCAL = {
  TESTORA_TARGET_BASE_URL: "http://localhost:3010",
  TESTORA_TARGET_HUB_URL: "http://localhost:3001",
  // A server env pointing at prod must NOT win over the run's target.
  ASAFARIM_HUB_URL: "https://hub.asafarim.com",
  ASAFARIM_TIMELINEAI_URL: "https://tlai.asafarim.com",
};

test("a Local run signs in on the local Hub and must land on the local app", async () => {
  const visited = await runLogin({ env: LOCAL });
  assert.equal(
    visited[0],
    "http://localhost:3001/sign-in?callbackUrl=" + encodeURIComponent("http://localhost:3010/dashboard"),
  );
  assert.equal(visited[1], "http://localhost:3010/dashboard");
});

test("landing on another origin than the run's target fails with a clear message", async () => {
  await assert.rejects(runLogin({ env: LOCAL, landOn: "https://tlai.asafarim.com/dashboard" }), (error: Error) => {
    assert.match(error.message, /SSO landed on https:\/\/tlai\.asafarim\.com but this run targets http:\/\/localhost:3010/);
    assert.match(error.message, /Hub URL \(http:\/\/localhost:3001\)/);
    return true;
  });
});

test("staying on Hub's sign-in page fails, naming the Hub", async () => {
  await assert.rejects(runLogin({ env: LOCAL, landOn: "http://localhost:3001/sign-in?error=CredentialsSignin" }), /did not leave Hub sign-in \(http:\/\/localhost:3001\)/);
});

test("a Remote run uses the production Hub and app", async () => {
  const visited = await runLogin({
    env: { TESTORA_TARGET_BASE_URL: "https://tlai.asafarim.com", TESTORA_TARGET_HUB_URL: "https://hub.asafarim.com" },
  });
  assert.ok(visited[0]!.startsWith("https://hub.asafarim.com/sign-in?callbackUrl="));
  assert.equal(visited[1], "https://tlai.asafarim.com/dashboard");
});

test("without a run target the script falls back to the server env, then the defaults", async () => {
  const fromEnv = await runLogin({
    env: { ASAFARIM_HUB_URL: "https://hub.staging.example", ASAFARIM_TIMELINEAI_URL: "https://tlai.staging.example" },
  });
  assert.ok(fromEnv[0]!.startsWith("https://hub.staging.example/sign-in"));
  const defaults = await runLogin({ env: {} });
  assert.ok(defaults[0]!.startsWith("https://hub.asafarim.com/sign-in"));
  assert.equal(defaults[1], "https://tlai.asafarim.com/dashboard");
});

test("the spec's target base URL is the fixture's (retargeted) origin", () => {
  assert.equal(fixtureOrigin("http://localhost:3010/dashboard?x=1"), "http://localhost:3010");
  assert.equal(fixtureOrigin("https://tlai.asafarim.com/"), "https://tlai.asafarim.com");
  assert.equal(fixtureOrigin("/relative"), undefined);
  assert.equal(fixtureOrigin(undefined), undefined);
});
