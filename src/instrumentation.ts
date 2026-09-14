// Next.js instrumentation hook — register() runs once when the server
// process starts (both `next dev` and `next start`), before it accepts any
// requests. Used here to start the Workshop WIP Excel auto-sync watcher
// (src/lib/jobs/excel-sync.ts) automatically, so Apollo X stays in sync
// with the configured WIP workbook for as long as the app itself is
// running — no separate script or window to remember to start. Ported from
// the equivalent hook already proven in the sibling ModApp codebase
// (src/instrumentation.ts there, watching src/lib/jobSync.ts).
//
// Runs in both the Node.js and Edge runtime bundles Next.js builds this
// file for; chokidar and Node's `fs` only work in the Node runtime, so
// everything below is gated on that (this is the pattern Next.js's own
// docs recommend for exactly this situation — see
// https://nextjs.org/docs/app/guides/instrumentation).
//
// 2026-09-14 — new file (Apollo X had no instrumentation.ts before this).
// See src/lib/jobs/excel-sync.ts's header comment for the full feature
// write-up, scoping decisions, and the "runs locally for now, will need
// revisiting once Apollo X moves to Render" caveat.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { jobSyncIsConfigured, runJobExcelSync, JOBS_SYNC_FILE_PATH } = await import("@/lib/jobs/excel-sync");

  if (!jobSyncIsConfigured()) {
    console.log(
      "[excel-sync] JOBS_SYNC_FILE_PATH / JOBS_SYNC_COMPANY_NAME not set in .env — Workshop WIP Excel auto-sync is disabled."
    );
    return;
  }

  // Dev mode can call register() more than once across hot-reloads/worker
  // restarts — a second watcher on the same file would double-process
  // every change. Same globalThis-flag trick as lib/prisma.ts's singleton,
  // for the same reason.
  const globalForSync = globalThis as unknown as { jobExcelSyncWatcherStarted?: boolean };
  if (globalForSync.jobExcelSyncWatcherStarted) return;
  globalForSync.jobExcelSyncWatcherStarted = true;

  const chokidar = await import("chokidar");

  async function runSyncSafely(reason: string) {
    console.log(`[excel-sync] ${reason} — syncing "${JOBS_SYNC_FILE_PATH}"...`);
    try {
      const summary = await runJobExcelSync();
      if (!summary.ok) {
        console.error(`[excel-sync] failed: ${summary.error}`);
        return;
      }
      const parts = [`${summary.created} created`, `${summary.updated} updated`, `${summary.unchanged} unchanged`];
      if (summary.skipped) parts.push(`${summary.skipped} row(s) skipped`);
      if (summary.skippedDuplicateJobNumber) parts.push(`${summary.skippedDuplicateJobNumber} duplicate job number(s) ignored`);
      if (summary.skippedBlankJobNumber) parts.push(`${summary.skippedBlankJobNumber} row(s) with no Job # skipped`);
      if (summary.customersCreated) parts.push(`${summary.customersCreated} new customer(s)`);
      console.log(`[excel-sync] done — ${parts.join(", ")} (of ${summary.totalRows} rows read).`);
      if (summary.unmappedType?.length) {
        console.warn(`[excel-sync] unrecognized Job Type ("Repair Type") text left as-is: ${summary.unmappedType.join(" | ")}`);
      }
      if (summary.unmappedStatus?.length) {
        console.warn(`[excel-sync] unrecognized Status text left as-is: ${summary.unmappedStatus.join(" | ")}`);
      }
      if (summary.unmappedPurchaseOrderStatus?.length) {
        console.warn(`[excel-sync] unrecognized PO Status text left as-is: ${summary.unmappedPurchaseOrderStatus.join(" | ")}`);
      }
      if (summary.unmappedTransport?.length) {
        console.warn(`[excel-sync] unrecognized Transport text left as-is: ${summary.unmappedTransport.join(" | ")}`);
      }
    } catch (err) {
      // A single bad run (e.g. the file was mid-save and briefly locked)
      // must never take the whole Apollo X server down with it.
      console.error("[excel-sync] unexpected error during sync:", err);
    }
  }

  // Run once immediately, in case the spreadsheet changed while the server
  // was down, then watch for further changes.
  await runSyncSafely("startup");

  const watcher = chokidar.watch(JOBS_SYNC_FILE_PATH, {
    // OneDrive's sync client and Excel's own save both write in stages
    // (temp file + rename, or several chunked writes) — wait until the
    // file has gone quiet for 2s before treating a change as "done", so a
    // sync never reads a half-written file.
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 },
    // Native OS file-change events can be unreliable through OneDrive's
    // Files On-Demand virtual filesystem on some setups. If changes to the
    // spreadsheet aren't being picked up, set JOBS_SYNC_USE_POLLING=true in
    // .env to fall back to polling instead.
    usePolling: process.env.JOBS_SYNC_USE_POLLING === "true",
    ignoreInitial: true,
  });

  watcher.on("change", () => void runSyncSafely("file changed"));
  watcher.on("error", (err) => console.error("[excel-sync] watcher error:", err));

  console.log(`[excel-sync] watching "${JOBS_SYNC_FILE_PATH}" for changes.`);
}
