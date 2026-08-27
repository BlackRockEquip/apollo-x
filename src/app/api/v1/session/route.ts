import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";

export async function GET() {
  try {
    const context = await requireRequestContext();
    return NextResponse.json({
      user: { id: context.userId, name: context.displayName },
      company: context.companyId ? { id: context.companyId, internalCode: context.companyInternalCode } : null,
      tenantRole: context.tenantRole,
      support: context.supportAccessId ? { id: context.supportAccessId, mode: context.supportMode } : null,
    });
  } catch (error) {
    return apiError(error);
  }
}
