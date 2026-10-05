import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyStorageLink } from "@/lib/storage/signing";
import { resolveLocalFolderObjectPath } from "@/lib/storage/local-folder-backend";
import { readFile } from "node:fs/promises";

// Serves a file from a company's "Local folder" storage location. The token
// in the URL is the credential (signed + expiring — see
// src/lib/storage/signing.ts); it is only ever handed out after the caller's
// own permission checks passed. Mirrors what an S3 presigned URL does for the
// bucket-backed options. Public in proxy.ts for the same reason: an <img> for
// a logo carries no session on the login page.
const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  zip: "application/zip",
};
const INLINE_SAFE = /^(image\/(png|jpeg|webp|gif)|application\/pdf)/;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyStorageLink(decodeURIComponent(token));
  if (!payload) return new NextResponse(null, { status: 404 });
  const settings = await prisma.companySettings.findUnique({ where: { companyId: payload.c }, select: { storageProvider: true, storageLocalPath: true } });
  if (settings?.storageProvider !== "LOCAL_FOLDER" || !settings.storageLocalPath) return new NextResponse(null, { status: 404 });
  try {
    const buffer = await readFile(resolveLocalFolderObjectPath(settings.storageLocalPath, payload.k));
    const extension = payload.f.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
    // Only images and PDFs may render inline; anything else is always a download.
    const disposition = payload.d === "inline" && INLINE_SAFE.test(contentType) ? "inline" : "attachment";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": contentType,
        "content-disposition": `${disposition}; filename="${payload.f.replace(/["\r\n]/g, "")}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
