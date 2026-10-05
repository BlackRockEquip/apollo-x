import { NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { apiError } from "@/lib/http/errors";
import { STORAGE_GUIDES, type StorageGuideKey } from "@/lib/storage/setup-guides";

// Downloadable README for a storage option (same text as the in-panel guide;
// source files live in docs/storage/).
export async function GET(_request: Request, { params }: { params: Promise<{ guide: string }> }) {
  try {
    requirePlatformPermission(await requireRequestContext(), "PLATFORM_CONFIGURATION_MANAGE");
    const { guide } = await params;
    const entry = STORAGE_GUIDES[guide as StorageGuideKey];
    if (!entry) return new NextResponse(null, { status: 404 });
    return new NextResponse(entry.markdown, {
      headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${entry.fileName}"`, "cache-control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
