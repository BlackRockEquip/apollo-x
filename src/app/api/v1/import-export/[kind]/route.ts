import { NextRequest, NextResponse } from "next/server";
import { requireRequestContext } from "@/lib/auth/session";
import { apiError } from "@/lib/http/errors";
import { requireSameOrigin } from "@/lib/security/request";
import { importModule, exportModuleData, ImportExportError } from "@/lib/import-export/service";
import { exportFormatQuery } from "@/lib/import-export/validation";
import type { ImportExportKind } from "@/lib/import-export/fields";

const KINDS = new Set(["customers", "suppliers", "jobs", "parts"]);
function kind(value: string): ImportExportKind {
  if (!KINDS.has(value)) throw new Error("NOT_FOUND");
  return value as ImportExportKind;
}

function friendlyError(error: unknown) {
  if (error instanceof ImportExportError) {
    return NextResponse.json({ error: { code: "IMPORT_EXPORT_ERROR", message: error.message } }, { status: 400 });
  }
  return apiError(error);
}

// GET ?format=xlsx|csv — streams the export workbook directly (same binary
// NextResponse pattern the company-logo route already uses), so the browser
// can just fetch()+blob() it rather than round-tripping a base64 JSON body.
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const ctx = await requireRequestContext();
    const k = kind((await params).kind);
    const { format } = exportFormatQuery.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { buffer, fileName, mimeType } = await exportModuleData(ctx, k, format);
    // Node's Buffer<ArrayBufferLike> isn't assignable to fetch's BodyInit
    // type as-is (a generic-parameter mismatch against Uint8Array<ArrayBuffer>,
    // not a real runtime issue — Buffer already is a Uint8Array). Copying into
    // a plain Uint8Array satisfies BodyInit without changing the bytes sent.
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

// POST {fileName, mimeType, contentBase64, mapping} — imports one module's
// rows using the confirmed column mapping (see previewImportFile for the
// header-preview step this follows).
export async function POST(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    requireSameOrigin(request);
    const ctx = await requireRequestContext();
    const k = kind((await params).kind);
    return NextResponse.json(await importModule(ctx, k, await request.json()));
  } catch (error) {
    return friendlyError(error);
  }
}
