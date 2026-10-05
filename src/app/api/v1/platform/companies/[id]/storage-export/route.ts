import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { exportPlatformCompanyFiles } from "@/lib/platform/storage-admin-service";

// "Export current files" on the Platform Storage location card — a .zip of
// every stored file for the company (plus manifest.csv), offered before the
// storage location is changed. Super Admin only.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { fileName, data } = await exportPlatformCompanyFiles(await requireRequestContext(), id);
    return new NextResponse(new Uint8Array(data), {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "STORAGE_EXPORT_TOO_LARGE") {
      return NextResponse.json({ error: { code: "STORAGE_EXPORT_TOO_LARGE", message: "This company has more than 200 MB of stored files, which is too much to zip in one go. Copy the files straight from the storage location instead." } }, { status: 413 });
    }
    if (error instanceof Error && ["PLATFORM_CONTEXT_REQUIRED", "RESOURCE_NOT_FOUND"].includes(error.message)) {
      return NextResponse.json({ error: { code: error.message, message: "Not available." } }, { status: 404 });
    }
    return apiError(error);
  }
}
