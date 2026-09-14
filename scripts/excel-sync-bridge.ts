// Excel WIP auto-sync — local bridge script.
//
// Once Apollo X runs on Render, the server itself has no access to a file
// on this machine (see claude/decision-storage-architecture-render-plus-
// object-storage.md and workshop-track-progress-2026-09-14-excel-wip-auto-
// sync.md). The actual sync LOGIC still lives entirely server-side, in
// src/lib/jobs/excel-sync.ts — this script's only job is to keep watching
// the OneDrive-synced WIP workbook on THIS machine (same as
// src/instrumentation.ts's in-process chokidar watcher used to do when
// Apollo X itself ran locally) and push the file's raw bytes to the
// deployed app's /api/v1/integrations/excel-sync route whenever it
// changes, over plain HTTPS, authenticated with a shared secret.
//
// This script is meant to run continuously on the user's own PC (the one
// with the OneDrive-synced workbook), completely separately from the
// Apollo X server process. Nothing about it is specific to Render — it
// only needs EXCEL_SYNC_TARGET_URL to be reachable over HTTPS.
//
// Run with: npm run excel-sync:bridge
// (add EXCEL_SYNC_API_KEY / EXCEL_SYNC_TARGET_URL / JOBS_SYNC_FILE_PATH /
// JOBS_SYNC_COMPANY_NAME to your local .env first — see .env.example.)
//
// 2026-09-14 (Render prep).

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Tiny .env loader — this script runs via `tsx`, completely outside
// Next.js's own request pipeline, so none of Next's automatic .env loading
// applies here. There's no `dotenv` dependency in this repo yet (Next.js's
// built-in loader has always made one unnecessary), so rather than add a
// new dependency for a handful of KEY=VALUE lines, this reads .env.local
// then .env itself with a minimal parser. Values already set in the real
// process environment (e.g. by a Windows Task Scheduler job) always win —
// same precedence Next.js's own env loading uses.
// ---------------------------------------------------------------------------
function loadDotEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnvFile(path.resolve(process.cwd(), ".env.local"));
loadDotEnvFile(path.resolve(process.cwd(), ".env"));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const JOBS_SYNC_FILE_PATH = process.env.JOBS_SYNC_FILE_PATH || "";
const JOBS_SYNC_COMPANY_NAME = process.env.JOBS_SYNC_COMPANY_NAME || "";
const JOBS_SYNC_USE_POLLING = process.env.JOBS_SYNC_USE_POLLING === "true";
const EXCEL_SYNC_API_KEY = process.env.EXCEL_SYNC_API_KEY || "";
// Trim a trailing slash so `${TARGET_URL}/api/v1/...` never ends up with a
// doubled "//" in the middle.
const EXCEL_SYNC_TARGET_URL = (process.env.EXCEL_SYNC_TARGET_URL || "").replace(/\/+$/, "");

function fail(message: string): never {
  console.error(`[excel-sync-bridge] ${message}`);
  process.exit(1);
}

if (!JOBS_SYNC_FILE_PATH) fail('JOBS_SYNC_FILE_PATH is not set (the local path to the WIP workbook, e.g. your OneDrive-synced .xlsx file). Set it in .env and try again.');
if (!JOBS_SYNC_COMPANY_NAME) fail("JOBS_SYNC_COMPANY_NAME is not set (the Apollo X company this workbook belongs to). Set it in .env and try again.");
if (!EXCEL_SYNC_API_KEY) fail("EXCEL_SYNC_API_KEY is not set. This must match the EXCEL_SYNC_API_KEY configured on the deployed Apollo X server. Set it in .env and try again.");
if (!EXCEL_SYNC_TARGET_URL) fail("EXCEL_SYNC_TARGET_URL is not set (the base URL of the deployed Apollo X app, e.g. https://apollox-staging.onrender.com). Set it in .env and try again.");
if (!fs.existsSync(JOBS_SYNC_FILE_PATH)) fail(`JOBS_SYNC_FILE_PATH does not point at an existing file: "${JOBS_SYNC_FILE_PATH}"`);

const SYNC_ENDPOINT = `${EXCEL_SYNC_TARGET_URL}/api/v1/integrations/excel-sync`;

// Mirrors the JobExcelSyncSummary shape returned by runJobExcelSync
// (src/lib/jobs/excel-sync.ts) — duplicated here rather than imported,
// since this script is intentionally standalone (it must keep working even
// when it's the only thing running on this machine, with no access to the
// rest of the Apollo X source tree it's pushing data to).
type SyncSummary = {
  ok: boolean;
  error?: string;
  totalRows?: number;
  created?: number;
  updated?: number;
  unchanged?: number;
  skipped?: number;
  skippedBlankJobNumber?: number;
  skippedDuplicateJobNumber?: number;
  customersCreated?: number;
  unmappedType?: string[];
  unmappedStatus?: string[];
  unmappedPurchaseOrderStatus?: string[];
  unmappedTransport?: string[];
  protectedFields?: number;
  protectedJobs?: number;
};

function logSummary(summary: SyncSummary): void {
  if (!summary.ok) {
    console.error(`[excel-sync-bridge] sync failed: ${summary.error ?? "(no error message returned)"}`);
    return;
  }
  const parts = [`${summary.created ?? 0} created`, `${summary.updated ?? 0} updated`, `${summary.unchanged ?? 0} unchanged`];
  if (summary.skipped) parts.push(`${summary.skipped} row(s) skipped`);
  if (summary.skippedDuplicateJobNumber) parts.push(`${summary.skippedDuplicateJobNumber} duplicate job number(s) ignored`);
  if (summary.skippedBlankJobNumber) parts.push(`${summary.skippedBlankJobNumber} row(s) with no Job # skipped`);
  if (summary.customersCreated) parts.push(`${summary.customersCreated} new customer(s)`);
  if (summary.protectedFields) parts.push(`${summary.protectedFields} field(s) protected (edited in Apollo X since last sync)`);
  console.log(`[excel-sync-bridge] done — ${parts.join(", ")} (of ${summary.totalRows ?? 0} rows read).`);
  if (summary.unmappedType?.length) console.warn(`[excel-sync-bridge] unrecognized Job Type ("Repair Type") text left as-is: ${summary.unmappedType.join(" | ")}`);
  if (summary.unmappedStatus?.length) console.warn(`[excel-sync-bridge] unrecognized Status text left as-is: ${summary.unmappedStatus.join(" | ")}`);
  if (summary.unmappedPurchaseOrderStatus?.length) console.warn(`[excel-sync-bridge] unrecognized PO Status text left as-is: ${summary.unmappedPurchaseOrderStatus.join(" | ")}`);
  if (summary.unmappedTransport?.length) console.warn(`[excel-sync-bridge] unrecognized Transport text left as-is: ${summary.unmappedTransport.join(" | ")}`);
}

let syncInFlight = false;
let syncQueued = false;

// A single-flight guard, same reasoning as instrumentation.ts didn't
// strictly need but this script does: OneDrive can fire several change
// events in quick succession around one save even after chokidar's own
// awaitWriteFinish settles, and this script (unlike the old in-process
// watcher) also always runs once at startup — overlapping uploads of the
// same file would just waste bandwidth and could race each other's
// createDraftJob calls. If a change arrives mid-upload, one follow-up run
// is queued (not one per event) so the latest file state is always synced
// eventually without piling up a growing backlog.
async function runSyncSafely(reason: string): Promise<void> {
  if (syncInFlight) {
    syncQueued = true;
    return;
  }
  syncInFlight = true;
  try {
    console.log(`[excel-sync-bridge] ${reason} — uploading "${JOBS_SYNC_FILE_PATH}" to ${SYNC_ENDPOINT}...`);
    const fileBuffer = fs.readFileSync(JOBS_SYNC_FILE_PATH);
    const contentBase64 = fileBuffer.toString("base64");

    const response = await fetch(SYNC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-excel-sync-key": EXCEL_SYNC_API_KEY,
      },
      body: JSON.stringify({ contentBase64, companyName: JOBS_SYNC_COMPANY_NAME }),
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      console.error(`[excel-sync-bridge] server returned a non-JSON response (HTTP ${response.status}). Is EXCEL_SYNC_TARGET_URL correct?`);
      return;
    }

    if (!response.ok) {
      const record = body as { error?: { code?: string; message?: string } } | null;
      console.error(`[excel-sync-bridge] server rejected the sync (HTTP ${response.status}, ${record?.error?.code ?? "UNKNOWN"}): ${record?.error?.message ?? "(no message)"}`);
      return;
    }

    logSummary(body as SyncSummary);
  } catch (err) {
    // A single failed run (server briefly down/redeploying, OneDrive file
    // locked mid-save, transient network blip) must never take the whole
    // bridge process down with it — it just tries again on the next file
    // change, same resilience src/instrumentation.ts's own watcher has.
    console.error("[excel-sync-bridge] unexpected error during sync:", err);
  } finally {
    syncInFlight = false;
    if (syncQueued) {
      syncQueued = false;
      void runSyncSafely("follow-up change during previous upload");
    }
  }
}

async function main() {
  const chokidar = await import("chokidar");

  // Run once immediately, in case the spreadsheet changed while this
  // script wasn't running, then watch for further changes.
  await runSyncSafely("startup");

  const watcher = chokidar.watch(JOBS_SYNC_FILE_PATH, {
    // OneDrive's sync client and Excel's own save both write in stages
    // (temp file + rename, or several chunked writes) — wait until the
    // file has gone quiet for 2s before treating a change as "done", so a
    // sync never uploads a half-written file. Same settings as
    // instrumentation.ts's own (now-retired, for Render) in-process
    // watcher used.
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
    // Native OS file-change events can be unreliable through OneDrive's
    // Files On-Demand virtual filesystem on some setups. If changes to the
    // spreadsheet aren't being picked up, set JOBS_SYNC_USE_POLLING=true in
    // .env to fall back to polling instead.
    usePolling: JOBS_SYNC_USE_POLLING,
    ignoreInitial: true,
  });

  watcher.on("change", () => void runSyncSafely("file changed"));
  watcher.on("error", (err) => console.error("[excel-sync-bridge] watcher error:", err));

  console.log(`[excel-sync-bridge] watching "${JOBS_SYNC_FILE_PATH}" for changes. Pushing to ${SYNC_ENDPOINT}. Press Ctrl+C to stop.`);
}

void main();
