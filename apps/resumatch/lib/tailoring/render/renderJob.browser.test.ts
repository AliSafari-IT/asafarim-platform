import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readJobPage } from "../fetchJob";
import { renderJobPosting, type UrlPolicy } from "./renderJob";

/**
 * Real-Chromium tests for the render tier (#518). Two local servers:
 *
 * - the "job site" on 127.0.0.1, the only origin the test policy allows;
 * - the "private" server on localhost, standing in for a private address
 *   (the metadata service, an internal admin port). It records every TCP
 *   connection and request, and the security tests assert it saw none.
 *
 * Skipped when no Chromium is available. CI runs it in resumatch-e2e,
 * which installs Chromium and sets RESUMATCH_PDF_CHROMIUM_PATH.
 */

const executablePath =
  process.env.RESUMATCH_PDF_CHROMIUM_PATH?.trim() ||
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : "");

const DESCRIPTION =
  "Senior Java ontwikkelaar bij Stad Gent. Je bouwt en onderhoudt de digitale dienstverlening voor burgers. " +
  "Je werkt met Java 21, Spring Boot en PostgreSQL in een team van acht ontwikkelaars. " +
  "Je hebt minstens vijf jaar ervaring met backend ontwikkeling en je spreekt vlot Nederlands.";

let site: Server;
let internal: Server;
let siteOrigin = "";
let internalOrigin = "";
const internalHits: string[] = [];
let internalConnections = 0;

/** A VDAB-shaped page: the server HTML is a shell, the text comes from an API call. */
function shellPage(extraScript = ""): string {
  return `<!doctype html><html><head><title>Vacature | Jobs</title>
<link rel="preconnect" href="${internalOrigin}">
<link rel="dns-prefetch" href="${internalOrigin}"></head>
<body><div id="app">Laden...</div>
<script>
fetch("/to-api").then(r => r.json()).then(job => {
  document.getElementById("app").innerHTML =
    "<h1>" + job.title + "</h1><p>" + job.employer + "</p><p>" + job.description + "</p>";
});
${extraScript}
</script></body></html>`;
}

function listen(server: Server, host: string): Promise<string> {
  return new Promise((resolve) => server.listen(0, host, () => resolve(`http://${host}:${(server.address() as AddressInfo).port}`)));
}

/**
 * The job site is addressed as jobsite.test, a name that does not resolve
 * anywhere: every request only works because the policy's checked address
 * (127.0.0.1) is used for the connection, with no second lookup (#518
 * review: DNS rebinding).
 */
const policy: UrlPolicy = async (url) => (new URL(url).origin === siteOrigin ? { address: "127.0.0.1", family: 4 } : null);

beforeAll(async () => {
  internal = createServer((req, res) => {
    internalHits.push(req.url ?? "");
    res.end("internal secret token");
  });
  internal.on("connection", () => {
    internalConnections += 1;
  });
  internal.on("upgrade", (req, socket) => {
    internalHits.push(`upgrade ${req.url}`);
    socket.destroy();
  });
  internalOrigin = (await listen(internal, "127.0.0.1")).replace("127.0.0.1", "localhost");

  site = createServer((req, res) => {
    const path = req.url ?? "/";
    if (path === "/api/vacature/1") {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ title: "Senior Java Developer", employer: "Stad Gent", description: DESCRIPTION }));
    }
    if (path === "/api/slow") {
      // The posting arrives well after the shell has painted.
      setTimeout(() => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ title: "Senior Java Developer", employer: "Stad Gent", description: DESCRIPTION }));
      }, 1_500);
      return;
    }
    if (path === "/huge") {
      // 6 MB, over the 4 MB cap, without a content-length header.
      res.setHeader("content-type", "text/plain");
      const chunk = "HUGE-MARKER ".repeat(10_000);
      let sent = 0;
      const pump = () => {
        while (sent < 6 * 1024 * 1024) {
          sent += chunk.length;
          if (!res.write(chunk)) return void res.once("drain", pump);
        }
        res.end();
      };
      return pump();
    }
    if (path === "/to-api") {
      res.writeHead(302, { location: "/api/vacature/1" });
      return res.end();
    }
    if (path === "/to-internal") {
      res.writeHead(302, { location: `${internalOrigin}/secret-redirect` });
      return res.end();
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (path === "/job") return res.end(shellPage());
    if (path === "/job-attacks") {
      return res.end(
        shellPage(`
fetch("${internalOrigin}/secret-fetch").catch(() => {});
fetch("/to-internal").catch(() => {});
try { navigator.sendBeacon("${internalOrigin}/secret-beacon", "x"); } catch (e) {}
try { new WebSocket("${internalOrigin.replace("http", "ws")}/secret-ws"); } catch (e) {}
const img = new Image(); img.src = "${internalOrigin}/secret-image";
const frame = document.createElement("iframe"); frame.src = "${internalOrigin}/secret-iframe"; document.body.appendChild(frame);
window.open("${internalOrigin}/secret-popup");
`),
      );
    }
    if (path === "/job-long-shell") {
      const nav = Array.from({ length: 40 }, (_, i) => `<a href="/menu/${i}">Menu item number ${i}</a>`).join(" ");
      return res.end(`<!doctype html><html><head><title>Vacature | Jobs</title></head><body>
<nav>${nav}</nav><div id="app">Laden...</div>
<script>
fetch("/api/slow").then(r => r.json()).then(job => {
  document.getElementById("app").innerHTML = "<h1>" + job.title + "</h1><p>" + job.description + "</p>";
});
fetch("/huge").then(r => r.text()).then(t => { document.body.insertAdjacentHTML("beforeend", "<p>" + t.slice(0, 50) + "</p>"); }).catch(() => {});
</script></body></html>`);
    }
    if (path === "/job-navigates") {
      return res.end(shellPage(`setTimeout(() => { window.location.href = "${internalOrigin}/secret-navigation"; }, 50);`));
    }
    res.statusCode = 404;
    res.end("not found");
  });
  siteOrigin = (await listen(site, "127.0.0.1")).replace("127.0.0.1", "jobsite.test");
});

afterAll(async () => {
  await new Promise((resolve) => site?.close(resolve));
  await new Promise((resolve) => internal?.close(resolve));
});

describe("the VDAB-shaped fixture", () => {
  it("is unreadable to the plain GET: the text only exists after JavaScript runs", () => {
    const plain = readJobPage(shellPage());
    expect(plain.ok).toBe(false);
    if (!plain.ok) expect(plain.reasonCode).toBe("NO_READABLE_TEXT");
  });
});

describe.skipIf(!executablePath)("renderJobPosting with real Chromium (#518)", () => {
  it("returns the JavaScript-rendered posting text", async () => {
    const result = await renderJobPosting(`${siteOrigin}/job`, { policy, executablePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rawText).toContain("Senior Java Developer");
    expect(result.rawText).toContain("Spring Boot en PostgreSQL");
    expect(result.title).toBe("Vacature | Jobs");
  }, 40_000);

  it("waits for the posting when the shell paints a long menu first, and refuses an oversized response", async () => {
    const result = await renderJobPosting(`${siteOrigin}/job-long-shell`, { policy, executablePath });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rawText).toContain("Spring Boot en PostgreSQL");
    expect(result.rawText).not.toContain("HUGE-MARKER");
  }, 40_000);

  it("blocks every in-page request toward a private address: fetch, redirect, beacon, WebSocket, image, iframe, popup, preconnect", async () => {
    internalHits.length = 0;
    internalConnections = 0;
    const result = await renderJobPosting(`${siteOrigin}/job-attacks`, { policy, executablePath });
    // The posting itself still renders: the attacks fail quietly.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rawText).not.toContain("internal secret token");
    expect(internalHits).toEqual([]);
    expect(internalConnections).toBe(0);
  }, 40_000);

  it("refuses a page that navigates itself to a private address", async () => {
    internalHits.length = 0;
    internalConnections = 0;
    const result = await renderJobPosting(`${siteOrigin}/job-navigates`, { policy, executablePath });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe("LEFT_ORIGIN");
    expect(internalHits).toEqual([]);
    expect(internalConnections).toBe(0);
  }, 40_000);

  it("refuses a pasted URL that redirects to a private address, without following it", async () => {
    internalHits.length = 0;
    internalConnections = 0;
    const result = await renderJobPosting(`${siteOrigin}/to-internal`, { policy, executablePath });
    expect(result.ok).toBe(false);
    expect(internalHits).toEqual([]);
    expect(internalConnections).toBe(0);
  }, 40_000);

  it("refuses a URL the policy refuses before starting a browser", async () => {
    const result = await renderJobPosting(`${internalOrigin}/secret`, { policy, executablePath });
    expect(result).toEqual({ ok: false, failure: "URL_NOT_ALLOWED" });
    expect(internalHits).toEqual([]);
  });

  it("stops at the wall-clock limit and closes the browser", async () => {
    const result = await renderJobPosting(`${siteOrigin}/job`, { policy, executablePath, wallClockMs: 1 });
    expect(result).toEqual({ ok: false, failure: "TIMEOUT" });
  }, 40_000);
});
