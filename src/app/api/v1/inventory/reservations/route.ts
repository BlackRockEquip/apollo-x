import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { countQuery, reservationInput } from "@/lib/inventory/validation";
import { reserveStock, listReservations } from "@/lib/inventory/service";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const input = countQuery.parse({
      status: url.searchParams.get("status") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
      page: url.searchParams.get("page") ?? "1",
      pageSize: url.searchParams.get("pageSize") ?? "25",
    });
    return NextResponse.json(await listReservations(await requireRequestContext(), input));
  } catch (e) { return apiError(e); }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json(await reserveStock(ctx, reservationInput.parse(await req.json())), { status: 201 });
  } catch (e) { return apiError(e); }
}