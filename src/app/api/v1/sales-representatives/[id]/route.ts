import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteSalesRepresentative, updateSalesRepresentative } from "@/lib/users/service";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const p = await params;
    return NextResponse.json(await updateSalesRepresentative(await requireRequestContext(), p.id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const p = await params;
    return NextResponse.json(await deleteSalesRepresentative(await requireRequestContext(), p.id));
  } catch (error) {
    return apiError(error);
  }
}
