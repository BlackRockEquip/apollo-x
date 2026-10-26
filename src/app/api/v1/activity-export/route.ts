import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { ActivityExportError, exportActivityHistory } from "@/lib/activity-export/service";

function friendlyError(error: unknown) {
  if (error instanceof ActivityExportError) {
    return NextResponse.json({ error: { code: "ACTIVITY_EXPORT_ERROR", message: error.message } }, { status: 400 });
  }
  return apiError(error);
}

// POST {includeJobActivity, includeAuditLog, jobIds?, from?, to?} — streams the .xlsx
// back (the same binary NextResponse pattern as the other import/export routes).
// Settings > Import / Export > "Export activity history".
export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const { buffer, fileName, mimeType } = await exportActivityHistory(ctx, await request.json());
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": mimeType,
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return friendlyError(error);
  }
}
