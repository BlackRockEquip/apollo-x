import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { bulkPartSearchInput } from "@/lib/inventory/validation";
import { searchPartsByNumbers } from "@/lib/inventory/service";

// 2026-09-14 — Stock Levels' "Check stock" popup: paste a list of part
// numbers, see what's on hand for each. Read-only — see
// searchPartsByNumbers in inventory/service.ts.
export async function POST(req: Request) {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json(await searchPartsByNumbers(ctx, bulkPartSearchInput.parse(await req.json())));
  } catch (e) { return apiError(e); }
}
