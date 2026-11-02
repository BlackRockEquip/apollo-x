import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { listStorageFolder, type FolderScope } from "@/lib/storage/folder-view";

// "View folder": GET /api/v1/storage/folder?scope=job&jobId=…&path=…&everything=1  (a job's folder, from the job page)
//                GET /api/v1/storage/folder?scope=company&path=…&search=BRE11       (the whole storage, Settings > Files; `search` finds job folders by number)
// `everything=1` (read the real folder on the server) only has an effect for a Flo X platform administrator.
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
    return NextResponse.json(await listStorageFolder(ctx, scopeFromSearch(search), search.get("path"), search.get("everything") === "1", search.get("search")), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
