import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listAllOutworkItems } from "@/lib/rfq/service";

// New — 2026-09-14, Suppliers screen's Outwork tab: every outwork item
// across every job, newest first. Adding/receiving/editing an item is
// still done from the item's own job (POST /api/v1/jobs/[id]/outwork etc.)
// — this route is read-only.
export async function GET() {
  try {
    return NextResponse.json({ items: await listAllOutworkItems(await requireRequestContext()) });
  } catch (error) {
    return apiError(error);
  }
}
