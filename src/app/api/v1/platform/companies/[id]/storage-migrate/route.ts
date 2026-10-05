import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { movePlatformCompanyFilesBatch } from "@/lib/platform/storage-admin-service";

// "Move files to this storage": moves one batch of job / RFQ / support files
// that are still saved in the database into the company's chosen storage
// location. The Storage card calls this repeatedly until nothing remains.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await params;
    return NextResponse.json(await movePlatformCompanyFilesBatch(await requireRequestContext(), id));
  } catch (error) {
    if (error instanceof Error && error.message === "STORAGE_NOT_CONFIGURED") {
      return NextResponse.json({ error: { code: "STORAGE_NOT_CONFIGURED", message: "Choose and save a storage location for this company first." } }, { status: 409 });
    }
    return apiError(error);
  }
}
