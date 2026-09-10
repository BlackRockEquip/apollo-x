import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addOutworkItems } from "@/lib/jobs/service";

// New — outwork tracking (send components to a supplier for outwork like
// machining/sandblasting; see schema.prisma's OutworkItem comment). Body:
// { supplierId, dateSentOut?, lines: [{ description, quantity }] }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await addOutworkItems(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
