import { describe, expect, it } from "vitest";
import { authorizeSource, isPublicHttpsUrl } from "./authorization";

const future = new Date("2027-01-01T00:00:00Z");
const now = new Date("2026-09-04T00:00:00Z");

function source(overrides: Partial<Parameters<typeof authorizeSource>[0]> = {}) {
  return {
    status: "ACTIVE",
    syncEnabled: true,
    agreementReference: "RIGHTS-REGISTER-001",
    agreementExpiresAt: future,
    endpoint: "https://feeds.example.test/jobs.json",
    ...overrides,
  };
}

describe("source authorization", () => {
  it("allows a fully authorised source", () => {
    expect(authorizeSource(source(), now)).toEqual({ allowed: true });
  });

  it("refuses a source with no agreement on file", () => {
    // The rule the whole milestone rests on: JobMatch does not fetch from a
    // source whose terms nobody recorded.
    expect(authorizeSource(source({ agreementReference: null }), now)).toEqual({
      allowed: false,
      reasonCode: "NO_AGREEMENT_REFERENCE",
    });
    expect(authorizeSource(source({ agreementReference: "   " }), now)).toEqual({
      allowed: false,
      reasonCode: "NO_AGREEMENT_REFERENCE",
    });
  });

  it("refuses an open-ended agreement", () => {
    // An agreement with no end date is not permanent permission; requiring
    // an expiry means every source is re-examined on a known date.
    expect(authorizeSource(source({ agreementExpiresAt: null }), now)).toEqual({
      allowed: false,
      reasonCode: "NO_AGREEMENT_EXPIRY",
    });
  });

  it("stops syncing when the agreement expires, without being switched off", () => {
    const expired = new Date("2026-09-03T23:59:59Z");
    expect(authorizeSource(source({ agreementExpiresAt: expired }), now)).toEqual({
      allowed: false,
      reasonCode: "AGREEMENT_EXPIRED",
    });
  });

  it("refuses a disabled or non-active source", () => {
    expect(authorizeSource(source({ syncEnabled: false }), now).allowed).toBe(false);
    expect(authorizeSource(source({ status: "PAUSED" }), now).allowed).toBe(false);
    expect(authorizeSource(source({ status: "DRAFT" }), now).allowed).toBe(false);
    expect(authorizeSource(source({ status: "TERMINATED" }), now).allowed).toBe(false);
  });

  it("refuses an endpoint that is not a public HTTPS address", () => {
    expect(authorizeSource(source({ endpoint: "http://feeds.example.test/x" }), now)).toEqual({
      allowed: false,
      reasonCode: "ENDPOINT_NOT_ALLOWED",
    });
  });

  it("fails closed on every axis at once", () => {
    // A source configured with nothing is refused, not defaulted into
    // working.
    const bare = {
      status: "DRAFT",
      syncEnabled: false,
      agreementReference: null,
      agreementExpiresAt: null,
      endpoint: "",
    };
    expect(authorizeSource(bare, now).allowed).toBe(false);
  });
});

describe("outbound destination policy", () => {
  it("accepts a public HTTPS endpoint", () => {
    expect(isPublicHttpsUrl("https://feeds.example.test/jobs.json")).toBe(true);
    expect(isPublicHttpsUrl("https://api.example.co.uk/v1/jobs?page=1")).toBe(true);
  });

  it("refuses plaintext HTTP", () => {
    // A feed fetched over plaintext can be rewritten in transit, and its
    // content is later fed to a parser and a model.
    expect(isPublicHttpsUrl("http://feeds.example.test/jobs.json")).toBe(false);
  });

  it("refuses the cloud metadata service", () => {
    // The canonical SSRF target: an operator-supplied endpoint pointed here
    // makes the sync fetch credentials on an attacker's behalf.
    expect(isPublicHttpsUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isPublicHttpsUrl("https://metadata.google.internal/computeMetadata/v1/")).toBe(false);
  });

  it("refuses loopback and private ranges", () => {
    for (const url of [
      "https://localhost/jobs",
      "https://127.0.0.1/jobs",
      "https://10.0.0.5/jobs",
      "https://192.168.1.10/jobs",
      "https://172.16.0.1/jobs",
      "https://172.31.255.254/jobs",
      "https://[::1]/jobs",
      "https://100.64.0.1/jobs",
    ]) {
      expect(isPublicHttpsUrl(url), url).toBe(false);
    }
  });

  it("refuses internal-looking names", () => {
    expect(isPublicHttpsUrl("https://intranet/jobs")).toBe(false);
    expect(isPublicHttpsUrl("https://api.internal/jobs")).toBe(false);
    expect(isPublicHttpsUrl("https://feeds.localhost/jobs")).toBe(false);
  });

  it("refuses anything that is not a URL at all", () => {
    expect(isPublicHttpsUrl("")).toBe(false);
    expect(isPublicHttpsUrl("not a url")).toBe(false);
    expect(isPublicHttpsUrl("file:///etc/passwd")).toBe(false);
  });

  it("allows a public address in the 172 range outside the private block", () => {
    // 172.15 and 172.32 are public; only 172.16-172.31 are private, and a
    // sloppier pattern would block legitimate hosts.
    expect(isPublicHttpsUrl("https://172.15.0.1/jobs")).toBe(true);
    expect(isPublicHttpsUrl("https://172.32.0.1/jobs")).toBe(true);
  });
});
