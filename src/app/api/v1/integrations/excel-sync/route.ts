import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runJobExcelSync } from "@/lib/jobs/excel-sync";

// Bridge endpoint for the local Excel-sync bridge script
// (scripts/excel-sync-bridge.ts) — see that script's own header comment,
// claude/decision-storage-architecture-render-plus-object-storage.md, and
// workshop-track-progress-2026-09-14-excel-wip-auto-sync.md for why this
// exists: once Apollo X runs on Render (no access to a file on the user's
// PC), the OneDrive-synced WIP workbook can only reach the app via a
// process that still runs on the user's own machine, pushing the file's
// bytes here over HTTPS instead of the app reading a local path directly.
//
// This is a machine-to-machine integration, not a browser request — there
// is no user session, so it is NOT gated by requireRequestContext()/
// requireSameOrigin() like every other route in this app. It is gated by a
// single shared secret (EXCEL_SYNC_API_KEY) instead, checked in constant
// time to avoid a timing side-channel on the comparison itself. Rotate the
// key (change the env var on both the server and the bridge script's own
// .env) if it's ever suspected of leaking.
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch rather than returning false —
  // compare against a fixed-length hash-free approach instead: pad isn't
  // safe (reveals length via early exit patterns elsewhere), so just bail
  // out on length mismatch directly. This still avoids a byte-by-byte
  // early-exit timing signal for two same-length strings, which is the
  // realistic attack surface for a shared secret.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: NextRequest) {
  const expectedKey = process.env.EXCEL_SYNC_API_KEY;
  if (!expectedKey) {
    return NextResponse.json({ error: { code: "EXCEL_SYNC_NOT_CONFIGURED", message: "EXCEL_SYNC_API_KEY is not set on this server." } }, { status: 503 });
  }
  const providedKey = request.headers.get("x-excel-sync-key") ?? "";
  if (!providedKey || !safeCompare(providedKey, expectedKey)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "Invalid or missing sync key." } }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Request body must be JSON." } }, { status: 400 });
  }
  const record = body as Record<string, unknown> | null;
  const contentBase64 = typeof record?.contentBase64 === "string" ? record.contentBase64 : null;
  if (!contentBase64) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "contentBase64 is required." } }, { status: 400 });
  }
  const companyName = typeof record?.companyName === "string" && record.companyName.trim() ? record.companyName.trim() : undefined;

  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(contentBase64, "base64");
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "contentBase64 could not be decoded." } }, { status: 400 });
  }
  if (fileBuffer.length === 0) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Uploaded file is empty." } }, { status: 400 });
  }

  try {
    const summary = await runJobExcelSync({ companyName, fileBuffer });
    return NextResponse.json(summary, { status: summary.ok ? 200 : 422 });
  } catch (error) {
    console.error("[excel-sync] unexpected error handling bridge upload:", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "The sync could not be completed." } }, { status: 500 });
  }
}
