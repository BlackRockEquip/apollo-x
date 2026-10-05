import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listPartsOutstanding } from "@/lib/jobs/parts-outstanding";

// New — 2026-10-05, Parts > Parts Outstanding tab: every job + supplier with
// parts still outstanding (RFQ-chased or manually added). See
// lib/jobs/parts-outstanding.ts.
export async function GET() {
  try {
    return NextResponse.json({ items: await listPartsOutstanding(await requireRequestContext()) });
  } catch (error) {
    return apiError(error);
  }
}
