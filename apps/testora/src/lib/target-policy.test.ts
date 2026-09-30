import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TargetPolicyError,
  assertRunnableTarget,
  blockedAddressReason,
  blockedHostnameReason,
  isStrictTargetPolicy,
  type LookupFn,
  type TargetPolicyCode,
  type TargetPolicyOptions,
} from "./target-policy";

/** A resolver that maps names to fixed addresses (no real DNS in tests). */
function fakeDns(table: Record<string, string[]>): LookupFn {
  return async (hostname) => {
    const addresses = table[hostname];
    if (!addresses) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
}

const publicDns = fakeDns({
  "tlai.asafarim.com": ["82.25.116.73"],
  "example.com": ["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"],
  "rebind.example.net": ["93.184.215.14", "10.0.0.5"],
  "metadata.example.net": ["169.254.169.254"],
  "v6-private.example.net": ["fd00::1"],
});

const strictStored = { isAdmin: false, stored: true, production: true, lookup: publicDns };

async function rejects(url: string, code: TargetPolicyCode, options: TargetPolicyOptions = strictStored) {
  await assert.rejects(assertRunnableTarget(url, options), (error: unknown) => {
    assert.ok(error instanceof TargetPolicyError, `${url}: not a TargetPolicyError`);
    assert.equal(error.code, code, `${url}: ${error.message}`);
    return true;
  });
}

// ── address ranges ───────────────────────────────────────────────────────

test("every blocked IPv4 range is refused", () => {
  const blocked = [
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "127.255.255.255",
    "169.254.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
  ];
  for (const ip of blocked) assert.notEqual(blockedAddressReason(ip), null, ip);
});

test("range edges: neighbours of blocked ranges stay public", () => {
  for (const ip of ["9.255.255.255", "11.0.0.0", "100.63.255.255", "100.128.0.0", "172.15.255.255", "172.32.0.0", "192.167.255.255", "192.169.0.0", "1.1.1.1", "82.25.116.73"]) {
    assert.equal(blockedAddressReason(ip), null, ip);
  }
});

test("every blocked IPv6 range is refused, including IPv4 embedded in IPv6", () => {
  const blocked = [
    "::",
    "::1",
    "0:0:0:0:0:0:0:1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.1.2.3",
    "::ffff:169.254.169.254",
    "::ffff:0.0.0.0",
    "::127.0.0.1",
    "64:ff9b::10.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "fc00::1",
    "fd00:ec2::254",
    "fe80::1",
    "fe80::1%eth0",
    "febf::1",
    "fec0::1",
    "ff02::1",
    "2001:db8::1",
    "100::1",
  ];
  for (const ip of blocked) assert.notEqual(blockedAddressReason(ip), null, ip);
});

test("public IPv6 (and public IPv4 inside IPv6) stays allowed", () => {
  for (const ip of ["2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "::ffff:1.1.1.1", "64:ff9b::101:101"]) {
    assert.equal(blockedAddressReason(ip), null, ip);
  }
});

test("internal hostnames are refused", () => {
  for (const host of ["localhost", "LOCALHOST.", "testora-postgres", "redis", "app.localhost", "printer.local", "metadata.google.internal", "nas.home.arpa", "box.lan"]) {
    assert.notEqual(blockedHostnameReason(host), null, host);
  }
  for (const host of ["tlai.asafarim.com", "example.com"]) {
    assert.equal(blockedHostnameReason(host), null, host);
  }
});

// ── assertRunnableTarget, production ─────────────────────────────────────

test("production: public stored targets pass", async () => {
  const url = await assertRunnableTarget("https://tlai.asafarim.com/dashboard", strictStored);
  assert.equal(url.origin, "https://tlai.asafarim.com");
  await assertRunnableTarget("https://example.com", strictStored);
  await assertRunnableTarget("http://1.1.1.1:8080", strictStored);
  await assertRunnableTarget("http://[2606:4700:4700::1111]/", strictStored);
});

test("production: IP-literal targets in blocked ranges are refused, whatever the spelling", async () => {
  for (const url of [
    "http://127.0.0.1:5432",
    "http://0.0.0.0:3005",
    "http://0/",
    "http://2130706433/", // 127.0.0.1 as a decimal
    "http://0x7f.1/", // 127.0.0.1 in hex shorthand
    "http://10.0.0.5",
    "http://100.64.1.1",
    "http://169.254.169.254/latest/meta-data/",
    "http://172.17.0.1",
    "http://192.168.0.1",
    "http://[::1]:3001",
    "http://[::]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[fd00:ec2::254]/",
    "http://[fe80::1]/",
  ]) {
    await rejects(url, "TARGET_ADDRESS_NOT_ALLOWED");
  }
});

test("production: internal hostnames are refused before any DNS lookup", async () => {
  let looked = false;
  const spy: LookupFn = async () => {
    looked = true;
    return [{ address: "1.1.1.1", family: 4 }];
  };
  for (const url of ["http://testora-postgres:5432", "http://localhost:3001", "http://hub.localhost", "http://metadata.google.internal/"]) {
    await rejects(url, "TARGET_HOST_NOT_ALLOWED", { ...strictStored, lookup: spy });
  }
  assert.equal(looked, false);
});

test("production: a hostname resolving to ANY blocked address is refused", async () => {
  await rejects("https://rebind.example.net", "TARGET_ADDRESS_NOT_ALLOWED");
  await rejects("https://metadata.example.net", "TARGET_ADDRESS_NOT_ALLOWED");
  await rejects("https://v6-private.example.net", "TARGET_ADDRESS_NOT_ALLOWED");
});

test("production: an unresolvable hostname is refused", async () => {
  await rejects("https://does-not-exist.example.org", "TARGET_UNRESOLVABLE");
});

// ── assertRunnableTarget, always ─────────────────────────────────────────

test("only http(s) and no userinfo, in every environment", async () => {
  for (const production of [true, false]) {
    const options = { ...strictStored, production };
    await rejects("file:///etc/passwd", "TARGET_SCHEME_NOT_ALLOWED", options);
    await rejects("ftp://example.com", "TARGET_SCHEME_NOT_ALLOWED", options);
    await rejects("javascript:alert(1)", "TARGET_SCHEME_NOT_ALLOWED", options);
    await rejects("https://user:pass@example.com", "TARGET_USERINFO_NOT_ALLOWED", options);
    await rejects("https://user@example.com", "TARGET_USERINFO_NOT_ALLOWED", options);
    await rejects("not a url", "INVALID_TARGET_URL", options);
  }
});

test("raw URLs are admin-only; stored targets are for everyone allowed to run", async () => {
  const raw = { isAdmin: false, stored: false, production: true, lookup: publicDns };
  await rejects("https://example.com", "RAW_TARGET_ADMIN_ONLY", raw);
  await assert.doesNotReject(assertRunnableTarget("https://example.com", { ...raw, isAdmin: true }));
  // Being admin never lifts the network rules.
  await rejects("http://169.254.169.254/", "TARGET_ADDRESS_NOT_ALLOWED", { ...raw, isAdmin: true });
});

test("local dev: localhost targets are allowed, the scheme rules still apply", async () => {
  const dev = { isAdmin: false, stored: true, production: false };
  await assert.doesNotReject(assertRunnableTarget("http://localhost:3010", dev));
  await assert.doesNotReject(assertRunnableTarget("http://127.0.0.1:3001", dev));
  await rejects("file:///etc/passwd", "TARGET_SCHEME_NOT_ALLOWED", dev);
});

test("strict mode follows NODE_ENV=production or TESTORA_TARGET_POLICY=strict", () => {
  assert.equal(isStrictTargetPolicy({ NODE_ENV: "production" }), true);
  assert.equal(isStrictTargetPolicy({ NODE_ENV: "development" }), false);
  assert.equal(isStrictTargetPolicy({ NODE_ENV: "development", TESTORA_TARGET_POLICY: "strict" }), true);
});

test("production: a DNS lookup that hangs is cut off and treated as unresolvable", async () => {
  const hang: LookupFn = () => new Promise(() => {});
  const started = Date.now();
  await rejects("https://slow.example.org", "TARGET_UNRESOLVABLE", { ...strictStored, lookup: hang, lookupTimeoutMs: 50 });
  assert.ok(Date.now() - started < 1_000, "the timeout must bound the wait");
});
