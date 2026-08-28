import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { positionQuery } from "@/lib/inventory/validation";
import { listInventoryPositions } from "@/lib/inventory/service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const input = positionQuery.parse({
      q: url.searchParams.get("q") ?? "",
      locationId: url.searchParams.get("locationId") ?? undefined,
      manufacturerId: url.searchParams.get("manufacturerId") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      stockState: url.searchParams.get("stockState") ?? "ALL",
      active: url.searchParams.get("active") ?? "all",
      page: url.searchParams.get("page") ?? "1",
      pageSize: url.searchParams.get("pageSize") ?? "25",
    });
    return NextResponse.json(await listInventoryPositions(await requireRequestContext(), input));
  } catch (e) { return apiError(e); }
}