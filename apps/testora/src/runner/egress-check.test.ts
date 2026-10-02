import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";
import { buildChildEnv, osEnvAllowlist } from "./child-env";
import { defaultGateway, isBlocked, outcomeOf, parseProbe, probeTcp } from "./egress-check";

test("only a timeout, an unreachable route or a missing name counts as blocked", () => {
  assert.equal(isBlocked("timeout"), true);
  assert.equal(isBlocked("unreachable"), true);
  assert.equal(isBlocked("no-dns"), true);
  // A refusal means the packet reached the target: the filter let it through.
  assert.equal(isBlocked("refused"), false);
  assert.equal(isBlocked("connected"), false);
  assert.equal(isBlocked("error"), false);
  assert.equal(outcomeOf("ECONNREFUSED"), "refused");
  assert.equal(outcomeOf("EHOSTUNREACH"), "unreachable");
  assert.equal(outcomeOf("ENOTFOUND"), "no-dns");
  assert.equal(outcomeOf("EWHATEVER"), "error");
});

test("parseProbe reads host:port and rejects anything else", () => {
  assert.deepEqual(parseProbe("172.16.1.1:22"), { host: "172.16.1.1", port: 22, label: "extra" });
  assert.deepEqual(parseProbe("testora-postgres:5432", "db"), { host: "testora-postgres", port: 5432, label: "db" });
  for (const bad of ["no-port", ":22", "host:0", "host:70000", "host:x"]) {
    assert.throws(() => parseProbe(bad), /host:port/);
  }
});

test("defaultGateway decodes /proc/net/route", () => {
  const table = [
    "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT",
    "eth1\t00FE1FAC\t00000000\t0001\t0\t0\t0\t00FFFFFF\t0\t0\t0",
    "eth1\t00000000\t01FE1FAC\t0003\t0\t0\t0\t00000000\t0\t0\t0",
  ].join("\n");
  assert.equal(defaultGateway(table), "172.31.254.1");
  assert.equal(defaultGateway(table.split("\n").slice(0, 2).join("\n")), null);
  assert.equal(defaultGateway(""), null);
});

test("probeTcp: an open port and a refusing one are both REACHABLE", async () => {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  try {
    const open = await probeTcp({ host: "127.0.0.1", port, label: "open" });
    assert.equal(open.outcome, "connected");
    assert.equal(open.blocked, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  const closed = await probeTcp({ host: "127.0.0.1", port, label: "closed" });
  assert.equal(closed.outcome, "refused");
  assert.equal(closed.blocked, false);
});

test("on Linux a job's child inherits only PATH, HOME, TMPDIR and the locale", () => {
  assert.deepEqual(osEnvAllowlist("linux"), ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]);
  const env = buildChildEnv(
    { TARGET_PASSWORD: "from-envelope", HOME: "/envelope-wins" },
    {
      PATH: "/usr/bin",
      HOME: "/home/node",
      LANG: "C.UTF-8",
      TESTORA_RUNNER_TOKEN: "runner-token",
      TESTORA_RUNNER_SIGNING_SECRETS: "signing",
      TESTORA_CONTROL_URL: "http://testora:3000",
      CHROME_BIN: "/usr/bin/chromium-browser",
    },
    "linux",
  );
  assert.deepEqual(env, {
    TARGET_PASSWORD: "from-envelope",
    HOME: "/envelope-wins",
    PATH: "/usr/bin",
    LANG: "C.UTF-8",
  });
});
