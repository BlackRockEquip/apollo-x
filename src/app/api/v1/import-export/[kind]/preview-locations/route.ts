import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { previewNewBinLocations, ImportExportError } from "@/lib/import-export/service";

// 2026-09-11 — per-row bin location resolution on Parts import: rather
// than silently leaving an unmatched bin location code unmapped (or,
// worse, auto-creating Storage Locations nobody confirmed), the client
// calls this once the column mapping is set and before the real import
// runs, and shows a confirmation box listing exactly which codes are new
// (see ImportExportWorkspace.tsx). Parts-only — every other import kind
// has no bin-location concept, so this 404s for them rather than silently
// returning an empty list that could be mistaken for "nothing new".
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const { kind } = await params;
    if (kind !== "parts") throw new Error("NOT_FOUND");
    return NextResponse.json(await previewNewBinLocations(ctx, await request.json()));
  } catch (error) {
    if (error instanceof ImportExportError) {
      return NextResponse.json({ error: { code: "IMPORT_EXPORT_ERROR", message: error.message } }, { status: 400 });
    }
    return apiError(error);
  }
}
