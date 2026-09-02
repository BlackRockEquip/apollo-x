import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { getJobKitById, setJobKitActive, updateJobKit } from "@/lib/job-kits/service";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json(await getJobKitById(await requireRequestContext(), (await params).id));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const p = await params;
    return NextResponse.json(await updateJobKit(await requireRequestContext(), p.id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const p = await params;
    return NextResponse.json(await setJobKitActive(await requireRequestContext(), p.id, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}