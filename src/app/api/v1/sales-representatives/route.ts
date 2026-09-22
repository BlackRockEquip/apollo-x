import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createSalesRepresentative, listSalesRepresentatives } from "@/lib/users/service";

// 2026-09-22 — user request: "under Settings-Users-User Setup, add Sales
// Representative same as mechanic field." CRUD for the admin-managed
// SalesRepresentative list, gated the same as the rest of users/service.ts
// (USERS_MANAGE) — mirrors /api/v1/mechanics/route.ts exactly. See the
// SalesRepresentative model comment in schema.prisma for why this exists
// separately from Job.salesRepresentative's old free-text column.
export async function GET() {
  try {
    return NextResponse.json({ salesRepresentatives: await listSalesRepresentatives(await requireRequestContext()) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createSalesRepresentative(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
