import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listPexInventory } from "@/lib/pex/service";

// "PEX Stock" is Apollo X's own page/route name for what shows ModApp's
// "PEX Inventory" content — see pex/validation.ts's pexInventoryListQuery
// comment. Repointed (2026-09-09) from the old listPexStockUnits to
// listPexInventory as part of the full PexRecord replacement.
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listPexInventory(await requireRequestContext(), Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) {
    return apiError(error);
  }
}
