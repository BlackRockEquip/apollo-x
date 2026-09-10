import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addPartLinesBulk } from "@/lib/jobs/service";

// Parts list — replaces the old "add part requirement" endpoint (see
// schema.prisma's JobPartLine comment). Accepts { bulkLines: string }, one
// row per line ("partNumber, quantity[, description]" — comma or
// tab-separated), same as ModApp's paste box.
export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await addPartLinesBulk(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
