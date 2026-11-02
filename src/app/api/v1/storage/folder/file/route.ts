import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { getStorageFileUrl, type FolderScope } from "@/lib/storage/folder-view";

// GET /api/v1/storage/folder/file?scope=job|company&jobId=…&path=<file path> -> { url, fileName }: a link that opens the file for 5 minutes.
function scopeFromSearch(search: URLSearchParams): FolderScope {
  if (search.get("scope") === "job") {
    const jobId = search.get("jobId")?.trim();
    if (!jobId) throw new Error("NOT_FOUND");
    return { kind: "job", jobId };
  }
  return { kind: "company" };
}

export async function GET(request: NextRequest) {
  try {
    const search = request.nextUrl.searchParams;
    const ctx = await requireRequestContext();
    return NextResponse.json(await getStorageFileUrl(ctx, scopeFromSearch(search), search.get("path") ?? ""), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
