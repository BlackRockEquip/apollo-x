import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { exportCompanyActivityHistoryForPlatform } from "@/lib/activity-export/service";

// GET — a platform administrator downloads one company's complete activity history
// (every job's activity plus the system audit log) as an .xlsx workbook.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireRequestContext();
    const { id } = await params;
    const { buffer, fileName, mimeType } = await exportCompanyActivityHistoryForPlatform(ctx, id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": mimeType,
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
