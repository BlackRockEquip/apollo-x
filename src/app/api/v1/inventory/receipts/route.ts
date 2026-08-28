import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { receiptInput } from "@/lib/inventory/validation";
import { receiveStock } from "@/lib/inventory/service";

export async function POST(req: Request) {
  try {
    const ctx = await requireRequestContext();
    return NextResponse.json(await receiveStock(ctx, receiptInput.parse(await req.json())), { status: 201 });
  } catch (e) { return apiError(e); }
}