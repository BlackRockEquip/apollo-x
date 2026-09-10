import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { previewImportFile, ImportExportError } from "@/lib/import-export/service";
import type { ImportExportKind } from "@/lib/import-export/fields";

const KINDS = new Set(["customers", "suppliers", "jobs", "parts"]);
function kind(value: string): ImportExportKind {
  if (!KINDS.has(value)) throw new Error("NOT_FOUND");
  return value as ImportExportKind;
}

// POST {fileName, mimeType, contentBase64} — reads just the header row +
// first 3 data rows, for the column-mapping step (see
// ImportExportWorkspace.tsx). The real import (POST /api/v1/import-export/
// [kind]) re-reads the file server-side once the mapping is confirmed,
// rather than trusting anything parsed here.
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const k = kind((await params).kind);
    return NextResponse.json(await previewImportFile(ctx, k, await request.json()));
  } catch (error) {
    if (error instanceof ImportExportError) {
      return NextResponse.json({ error: { code: "IMPORT_EXPORT_ERROR", message: error.message } }, { status: 400 });
    }
    return apiError(error);
  }
}
