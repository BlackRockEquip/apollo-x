import { NextResponse } from "next/server";
import { readLocalDiskObject } from "@/lib/storage/local-disk-backend";

// Dev-only: serves files written by the local-disk storage fallback (see
// src/lib/storage/local-disk-backend.ts), which is itself only ever
// selected when NODE_ENV !== "production" and no STORAGE_* env vars are
// configured. Refusing outright in production is defence in depth on top
// of that — this route should never be reachable there, but if it somehow
// were, it must not leak files. Deliberately no auth/company-scoping check
// here: local dev only ever has one developer using the app, and the real
// company-scoping/permission checks already happened before a caller was
// ever handed this URL (see src/lib/attachments/service.ts).
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const { key } = await params;
  try {
    const buffer = await readLocalDiskObject(key.join("/"));
    return new NextResponse(new Uint8Array(buffer), { headers: { "content-type": "application/octet-stream", "cache-control": "no-store" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
