import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { JOBS_WIP_COLUMNS } from "@/lib/jobs/wip-columns";
import { getJobsWipColumns, saveJobsWipColumns, resetJobsWipColumns } from "@/lib/jobs/wip-columns-service";

// GET — this user's saved column selection (or the default set if they've
// never chosen one) plus the full column catalog, so the client-side picker
// doesn't need a second endpoint just to know what's choosable.
export async function GET() {
  try {
    const ctx = await requireRequestContext();
    const columns = await getJobsWipColumns(ctx);
    return NextResponse.json({ columns, available: JOBS_WIP_COLUMNS });
  } catch (error) {
    return apiError(error);
  }
}

// PUT {columns: string[]} — saves this user's chosen column set.
export async function PUT(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const columns = await saveJobsWipColumns(ctx, (await request.json()).columns);
    return NextResponse.json({ columns });
  } catch (error) {
    return apiError(error);
  }
}

// DELETE — clears this user's saved selection, reverting to the default set.
export async function DELETE(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const columns = await resetJobsWipColumns(ctx);
    return NextResponse.json({ columns });
  } catch (error) {
    return apiError(error);
  }
}
