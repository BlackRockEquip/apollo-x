import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { movementQuery } from "@/lib/inventory/validation";
import { listStockMovements } from "@/lib/inventory/service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const input = movementQuery.parse({
      partId: url.searchParams.get("partId") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
      movementType: url.searchParams.get("movementType") ?? undefined,
      page: url.searchParams.get("page") ?? "1",
      pageSize: url.searchParams.get("pageSize") ?? "25",
    });
    return NextResponse.json(await listStockMovements(await requireRequestContext(), input));
  } catch (e) { return apiError(e); }
}