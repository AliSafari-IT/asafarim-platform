/**
 * Load the synthetic showcase source into a running JobMatch instance
 * (issue #208).
 *
 * This is a thin HTTP client for `POST /api/ingestion/showcase`, so it runs
 * in a plain Node context with no access to the app's server-only modules.
 * The dev server (or a deployed instance) must be up.
 *
 *   pnpm --filter @asafarim/jobmatch showcase:load
 *   pnpm --filter @asafarim/jobmatch showcase:load -- --reset
 *
 * Environment:
 *   JOBMATCH_INGESTION_TOKEN   required — same token the sync route uses
 *   JOBMATCH_SHOWCASE_URL      optional — base URL, default http://localhost:3012
 */

const token = process.env.JOBMATCH_INGESTION_TOKEN;
if (!token) {
  console.error(
    "JOBMATCH_INGESTION_TOKEN is not set. It is required — the showcase route is disabled without it.",
  );
  process.exit(1);
}

const baseUrl = (process.env.JOBMATCH_SHOWCASE_URL ?? "http://localhost:3012").replace(/\/$/, "");
const reset = process.argv.slice(2).includes("--reset");

const response = await fetch(`${baseUrl}/api/ingestion/showcase`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ reset }),
}).catch((error: unknown) => {
  console.error(`Could not reach ${baseUrl} — is the JobMatch server running?`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

const text = await response.text();
if (!response.ok) {
  console.error(`Request failed (${response.status}): ${text}`);
  process.exit(1);
}

console.log(reset ? "Showcase source reloaded (reset):" : "Showcase source loaded:");
console.log(text);
