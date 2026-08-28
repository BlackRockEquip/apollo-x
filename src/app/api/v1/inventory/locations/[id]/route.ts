import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getLocationDetail } from "@/lib/inventory/service";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getLocationDetail(await requireRequestContext(), (await params).id));
  } catch (e) { return apiError(e); }
}