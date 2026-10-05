import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { importPlatformCompanyFiles } from "@/lib/platform/storage-admin-service";

// Import of an exported .zip (see storage-export) into the company's CURRENT
// storage location, so files exported before a storage change open again.
// Body: the raw .zip. This path is excluded from the proxy.ts matcher so large
// bodies are not capped; the route authenticates itself.
const MAX_IMPORT_BYTES = 250 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_IMPORT_BYTES) return NextResponse.json({ error: { code: "TOO_LARGE", message: "That zip is larger than 250 MB. Copy the files straight into the storage location instead." } }, { status: 413 });
    const { id } = await params;
    const zip = Buffer.from(await request.arrayBuffer());
    if (zip.length === 0) return NextResponse.json({ error: { code: "EMPTY", message: "No file received." } }, { status: 400 });
    return NextResponse.json(await importPlatformCompanyFiles(ctx, id, zip));
  } catch (error) {
    if (error instanceof Error && error.message === "STORAGE_IMPORT_BAD_ZIP") return NextResponse.json({ error: { code: "BAD_ZIP", message: "That file is not a readable .zip." } }, { status: 400 });
    if (error instanceof Error && error.message === "STORAGE_NOT_CONFIGURED") return NextResponse.json({ error: { code: "STORAGE_NOT_CONFIGURED", message: "Choose and save a storage location for this company first." } }, { status: 409 });
    return apiError(error);
  }
}
