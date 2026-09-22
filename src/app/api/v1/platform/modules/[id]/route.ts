import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { deleteModuleCatalogEntry, getModuleCatalogEntry, updateModuleCatalogEntry } from "@/lib/platform/module-catalog-service";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getModuleCatalogEntry(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await updateModuleCatalogEntry(await requireRequestContext(), (await params).id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

// 2026-09-22, user request: "on modules menu, make modules editable
// (Enable/disable/delete)."
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await deleteModuleCatalogEntry(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}