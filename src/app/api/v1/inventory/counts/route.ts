import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { countQuery, countCreateInput } from "@/lib/inventory/validation";
import { listStockCounts, countCreate } from "@/lib/inventory/service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const input = countQuery.parse({
      status: url.searchParams.get("status") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
      page: url.searchParams.get("page") ?? "1",
      pageSize: url.searchParams.get("pageSize") ?? "25",
    });
    return NextResponse.json(await listStockCounts(await requireRequestContext(), input));
  } catch (e) { return apiError(e); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json(await countCreate(ctx, countCreateInput.parse(await req.json())), { status: 201 });
  } catch (e) { return apiError(e); }
}