import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { addJobItem, removeJobItem, updateJobItem } from "@/lib/jobs/service";

// 2026-10-29, Engineering multi-item jobs. POST adds an item to the job; PATCH ?itemId= edits one item or moves just that item
// to another step; DELETE ?itemId= removes it. (The item id rides on the query string so this route stays one folder shallower.)
function itemIdOf(request: NextRequest): string {
  const itemId = request.nextUrl.searchParams.get("itemId");
  if (!itemId) throw new Error("itemId is required.");
  return itemId;
}

export async function POST(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await addJobItem(await requireRequestContext(), id, await request.json()), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await updateJobItem(await requireRequestContext(), id, itemIdOf(request), await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<unknown> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params as { id: string };
    return NextResponse.json(await removeJobItem(await requireRequestContext(), id, itemIdOf(request)));
  } catch (error) {
    return apiError(error);
  }
}
