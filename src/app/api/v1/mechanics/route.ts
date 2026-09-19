import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { createMechanic, listMechanics } from "@/lib/users/service";

// 2026-09-19 — user request: "User Setup will be where an admin can setup
// Mechanic Names that the corresponding fields in jobs pickup." CRUD for
// the admin-managed Mechanic list, gated the same as the rest of
// users/service.ts (USERS_MANAGE). See the Mechanic model comment in
// schema.prisma for why this is separate from real system users.
export async function GET() {
  try {
    return NextResponse.json({ mechanics: await listMechanics(await requireRequestContext()) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    return NextResponse.json(await createMechanic(await requireRequestContext(), await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
