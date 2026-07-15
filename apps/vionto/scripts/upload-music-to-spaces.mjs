#!/usr/bin/env node
/**
 * Standalone script to upload local music files to DigitalOcean Spaces (S3-compatible).
 * Plain JS, no TypeScript/Next.js build pipeline — easy to debug independently.
 *
 * Usage (from repo root):
 *   pnpm --filter vionto upload-music
 *   pnpm --filter vionto upload-music -- --test
 *   pnpm --filter vionto upload-music -- --dryRun
 *   pnpm --filter vionto upload-music -- --dir "C:\Users\saal\Music\immostoryai" --scope immostoryai
 *
 * Required env vars (from root .env, loaded via dotenv-cli):
 *   DO_SPACES_ENDPOINT   e.g. https://fra1.digitaloceanspaces.com  (bucket-less, region endpoint)
 *   DO_SPACES_REGION     e.g. fra1
 *   DO_SPACES_BUCKET     e.g. asafarim-vionto
 *   DO_SPACES_KEY        Spaces access key
 *   DO_SPACES_SECRET     Spaces secret key
 *
 * Files are uploaded under: vionto/common/audio/{scope}/{category}/{uuid}/{filename}
 * where {category} is the immediate subfolder name relative to --dir (or "misc").
 * This makes them visible to ALL users via GET /api/music/library (the "common" library).
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve, dirname, basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Self-contained .env parser (like the MinIO script) ─────────────────────
// Reads credentials directly from disk so special characters (+, /, =) in
// secrets are never mangled by dotenv-cli or shell escaping.

function parseEnvFile(envPath) {
  if (!existsSync(envPath)) return {};
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes (single or double) if present
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// Merge: process.env takes precedence, fall back to parsed .env files
function loadEnv(envFiles) {
  const merged = {};
  for (const f of envFiles) {
    if (existsSync(f)) {
      const parsed = parseEnvFile(f);
      for (const [k, v] of Object.entries(parsed)) {
        if (!(k in merged)) merged[k] = v;
      }
    }
  }
  // process.env wins over file values
  for (const [k, v] of Object.entries(process.env)) {
    merged[k] = v;
  }
  return merged;
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  // Default env file search order: app .env, then root .env (two levels up from scripts/)
  const appEnv = resolve(__dirname, "..", ".env");
  const rootEnv = resolve(__dirname, "..", "..", "..", ".env");
  const out = {
    dir: "C:\\Users\\saal\\Music\\immostoryai",
    scope: "immostoryai",
    watch: false,
    dryRun: false,
    test: false,
    envFiles: [appEnv, rootEnv],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") out.dir = argv[++i];
    else if (a === "--scope") out.scope = argv[++i];
    else if (a === "--watch") out.watch = true;
    else if (a === "--dryRun") out.dryRun = true;
    else if (a === "--test") out.test = true;
    else if (a === "--env") out.envFiles = [resolve(argv[++i])];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

// ─── Env / client setup ──────────────────────────────────────────────────────
// Load from disk first (bypasses dotenv-cli mangling of + / = in secrets)

const env = loadEnv(args.envFiles);
console.log("  env sources:");
for (const f of args.envFiles) {
  console.log(`    ${f} ${existsSync(f) ? "(found)" : "(not found)"}`);
}

const {
  DO_SPACES_ENDPOINT,
  DO_SPACES_REGION,
  DO_SPACES_BUCKET,
  DO_SPACES_KEY,
  DO_SPACES_SECRET,
} = env;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!DO_SPACES_ENDPOINT) fail("Missing DO_SPACES_ENDPOINT in environment/.env");
if (!DO_SPACES_REGION) fail("Missing DO_SPACES_REGION in environment/.env");
if (!DO_SPACES_BUCKET) fail("Missing DO_SPACES_BUCKET in environment/.env");
if (!DO_SPACES_KEY) fail("Missing DO_SPACES_KEY in environment/.env");
if (!DO_SPACES_SECRET) fail("Missing DO_SPACES_SECRET in environment/.env");

/**
 * Strip the bucket name from the endpoint host if present, e.g.
 *   https://asafarim-vionto.fra1.digitaloceanspaces.com  ->  https://fra1.digitaloceanspaces.com
 * We then use forcePathStyle so the SDK never re-adds the bucket to the hostname,
 * avoiding virtual-hosted-style vs path-style signature mismatches entirely.
 */
function bucketlessEndpoint(rawEndpoint, bucket) {
  const trimmed = rawEndpoint.replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    const prefix = `${bucket}.`;
    if (url.hostname.startsWith(prefix)) {
      url.hostname = url.hostname.slice(prefix.length);
      return url.toString().replace(/\/+$/, "");
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

const endpoint = bucketlessEndpoint(DO_SPACES_ENDPOINT, DO_SPACES_BUCKET);

console.log("── DO Spaces config ──────────────────────────────");
console.log(`  raw endpoint env : ${DO_SPACES_ENDPOINT}`);
console.log(`  using endpoint   : ${endpoint}`);
console.log(`  region           : ${DO_SPACES_REGION}`);
console.log(`  bucket           : ${DO_SPACES_BUCKET}`);
console.log(`  access key       : ${DO_SPACES_KEY.slice(0, 4)}...${DO_SPACES_KEY.slice(-4)}`);
console.log(`  secret key       : ${"*".repeat(8)} (length ${DO_SPACES_SECRET.length})`);
console.log("───────────────────────────────────────────────────\n");

const client = new S3Client({
  endpoint,
  region: DO_SPACES_REGION,
  credentials: {
    accessKeyId: DO_SPACES_KEY,
    secretAccessKey: DO_SPACES_SECRET,
  },
  forcePathStyle: true, // avoids bucket-subdomain hostname mismatches
  logger: process.env.DEBUG
    ? {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: (...a) => console.warn("[sdk:warn]", ...a),
        error: (...a) => console.error("[sdk:error]", ...a),
      }
    : undefined,
});

// ─── Storage helpers ─────────────────────────────────────────────────────────

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".webm", ".aac", ".flac"]);

function inferContentType(filename) {
  switch (extname(filename).toLowerCase()) {
    case ".mp3": return "audio/mpeg";
    case ".wav": return "audio/wav";
    case ".ogg": return "audio/ogg";
    case ".m4a": return "audio/mp4";
    case ".webm": return "audio/webm";
    case ".aac": return "audio/aac";
    case ".flac": return "audio/flac";
    default: return "audio/mpeg";
  }
}

function safeSegment(value, fallback) {
  const cleaned = value
    .replace(/[\\/]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function makeCommonKey(scope, rootDir, filePath) {
  const rel = relative(rootDir, filePath);
  const relDir = dirname(rel);
  const category = relDir === "." ? "misc" : safeSegment(relDir, "misc");
  const filename = safeSegment(basename(rel), "file");
  return `vionto/common/audio/${scope}/${category}/${randomUUID()}/${filename}`;
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

async function collectAudioFiles(dir) {
  const files = [];
  for await (const file of walk(dir)) {
    if (AUDIO_EXTENSIONS.has(extname(file).toLowerCase())) {
      files.push(file);
    }
  }
  return files;
}

async function uploadFile(scope, rootDir, filePath) {
  const key = makeCommonKey(scope, rootDir, filePath);
  const body = await readFile(filePath);
  const contentType = inferContentType(filePath);

  const putCommand = new PutObjectCommand({
    Bucket: DO_SPACES_BUCKET,
    Key: key,
    ContentType: contentType,
    ACL: "public-read",
  });
  const putUrl = await getSignedUrl(client, putCommand, { expiresIn: 120 });

  const res = await fetch(putUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-acl": "public-read",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }

  return { key, url: `${endpoint.replace(/\/+$/, "")}/${DO_SPACES_BUCKET}/${key}` };
}

function logError(label, error) {
  console.error(`✗ ${label}`);
  console.error(`  name: ${error?.name}`);
  console.error(`  message: ${error?.message}`);
  if (error?.Code) console.error(`  Code: ${error.Code}`);
  if (error?.$metadata) console.error(`  metadata: ${JSON.stringify(error.$metadata)}`);
  if (error?.cause) {
    console.error(`  cause: ${error.cause?.message ?? error.cause}`);
    if (error.cause?.code) console.error(`  cause.code: ${error.cause.code}`);
  }
  if (process.env.DEBUG) console.error(error?.stack ?? error);
}

/**
 * Uses a presigned URL + raw fetch instead of client.send() so we get the
 * unmodified XML error body from DO Spaces, bypassing the AWS SDK's error
 * deserializer (which sometimes reports a generic "UnknownError" for
 * non-AWS S3-compatible providers).
 */
async function rawPresignedTest(testKey) {
  const putCommand = new PutObjectCommand({
    Bucket: DO_SPACES_BUCKET,
    Key: testKey,
    ContentType: "text/plain",
  });
  const putUrl = await getSignedUrl(client, putCommand, { expiresIn: 60 });

  console.log(`  PUT ${putUrl.split("?")[0]}?...(signed)`);
  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: "ok",
  });
  const putBody = await putRes.text();
  console.log(`  status: ${putRes.status} ${putRes.statusText}`);
  if (putBody) console.log(`  body: ${putBody}`);

  if (!putRes.ok) {
    return { ok: false, status: putRes.status, body: putBody };
  }

  const deleteCommand = new DeleteObjectCommand({ Bucket: DO_SPACES_BUCKET, Key: testKey });
  const deleteUrl = await getSignedUrl(client, deleteCommand, { expiresIn: 60 });
  const delRes = await fetch(deleteUrl, { method: "DELETE" });
  console.log(`  cleanup DELETE status: ${delRes.status}`);

  return { ok: true };
}

function explainDoSpacesError(status, body) {
  if (body.includes("SignatureDoesNotMatch")) {
    console.error("\n  → SignatureDoesNotMatch: DO_SPACES_SECRET is wrong, or has extra");
    console.error("    whitespace/quotes, or was copied incorrectly. Re-copy the secret key");
    console.error("    from the DigitalOcean Spaces API panel and paste it with no quotes.");
  } else if (body.includes("InvalidAccessKeyId")) {
    console.error("\n  → InvalidAccessKeyId: DO_SPACES_KEY does not exist or was revoked.");
    console.error("    Generate a new Spaces access key/secret pair in the DO control panel.");
  } else if (body.includes("AccessDenied")) {
    console.error("\n  → AccessDenied: the key exists but lacks permission for this bucket.");
    console.error("    Check the key's scope (full access vs. restricted to another Space)");
    console.error(`    and confirm the bucket name "${DO_SPACES_BUCKET}" is correct.`);
  } else if (status === 404) {
    console.error("\n  → 404 Not Found: the bucket name or region endpoint may be wrong.");
  } else {
    console.error("\n  → Unrecognized error. See the raw body above for details.");
  }
}

async function testConnection() {
  const testKey = `vionto/common/audio/${args.scope}/.connectivity-test-${randomUUID()}`;
  console.log("Testing PutObject via presigned URL (raw fetch, shows real DO Spaces error)...");
  try {
    const result = await rawPresignedTest(testKey);
    if (!result.ok) {
      explainDoSpacesError(result.status, result.body ?? "");
      return false;
    }
    console.log("✓ PutObject + DeleteObject succeeded via presigned URL.");
  } catch (error) {
    logError("Presigned URL test failed.", error);
    return false;
  }

  console.log("\nTesting bucket access via SDK HeadBucket...");
  try {
    await client.send(new HeadBucketCommand({ Bucket: DO_SPACES_BUCKET }));
    console.log("✓ HeadBucket succeeded — bucket is reachable with these credentials.");
  } catch (error) {
    logError("HeadBucket failed (SDK-level, non-fatal if PutObject above succeeded).", error);
  }

  return true;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const dir = resolve(args.dir);

  const ok = await testConnection();
  console.log("");
  if (!ok) {
    console.error("Aborting: credentials/endpoint/bucket are not working.");
    console.error("Double-check DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_ENDPOINT, DO_SPACES_REGION, DO_SPACES_BUCKET.");
    console.error("Tip: DO_SPACES_ENDPOINT should be the REGION endpoint (no bucket name), e.g.");
    console.error("     https://fra1.digitaloceanspaces.com");
    process.exit(1);
  }

  if (args.test) {
    console.log("Credential test passed. Run without --test to upload.");
    process.exit(0);
  }

  if (!existsSync(dir)) {
    fail(`Directory not found: ${dir}`);
  }

  const files = await collectAudioFiles(dir);
  console.log(`Found ${files.length} audio file(s) in ${dir}`);
  console.log(`Target prefix: vionto/common/audio/${args.scope}/\n`);

  if (args.dryRun) {
    for (const file of files) {
      console.log(`[dry-run] ${file} -> ${makeCommonKey(args.scope, dir, file)}`);
    }
    process.exit(0);
  }

  let uploaded = 0;
  let failed = 0;
  for (const file of files) {
    try {
      const { key, url } = await uploadFile(args.scope, dir, file);
      console.log(`✓ ${file}`);
      console.log(`  -> ${key}`);
      console.log(`  ${url}`);
      uploaded++;
    } catch (error) {
      console.error(`✗ ${file}`);
      console.error(`  ${error.name}: ${error.message}`);
      failed++;
    }
  }
  console.log(`\nUploaded ${uploaded}/${files.length} file(s). Failed: ${failed}`);

  if (args.watch) {
    console.log(`\nWatching ${dir} for new audio files. Press Ctrl+C to stop.`);
    const fs = await import("node:fs");
    fs.watch(dir, { recursive: true }, async (_eventType, filename) => {
      if (!filename) return;
      const filePath = join(dir, filename);
      if (!AUDIO_EXTENSIONS.has(extname(filePath).toLowerCase())) return;
      try {
        const s = await stat(filePath);
        if (!s.isFile()) return;
      } catch {
        return;
      }
      console.log(`\nDetected new file: ${filePath}`);
      try {
        const { key, url } = await uploadFile(args.scope, dir, filePath);
        console.log(`✓ ${filePath}`);
        console.log(`  -> ${key}`);
        console.log(`  ${url}`);
      } catch (error) {
        console.error(`✗ ${filePath}`);
        console.error(`  ${error.name}: ${error.message}`);
      }
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
