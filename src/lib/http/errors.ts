import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth/guards";
import { Prisma } from "@prisma/client";

export class StockError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "StockError";
  }
}

export function apiError(error: unknown) {
  if (error instanceof StockError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 409 });
  if (error instanceof AuthorizationError) return NextResponse.json({ error: { code: "FORBIDDEN", message: error.message } }, { status: 403 });
  if (error instanceof ZodError) return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "The request is invalid.", fields: error.flatten().fieldErrors } }, { status: 400 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: { code: "DUPLICATE", message: "A record with the same company-specific code or name already exists." } }, { status: 409 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return NextResponse.json({ error: { code: "NOT_FOUND", message: "The requested tenant record was not found." } }, { status: 404 });
  if (error instanceof Error && ["NOT_FOUND", "PARENT_NOT_FOUND", "SEQUENCE_NOT_FOUND"].includes(error.message)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "The requested tenant record was not found." } }, { status: 404 });
  if (error instanceof Error && error.message === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } }, { status: 401 });
  // Attachment/object-storage errors (src/lib/attachments/service.ts,
  // company-settings-service.ts's updateCompanyLogo) — added 2026-09-14
  // alongside the storage-architecture work.
  if (error instanceof Error && error.message === "INVALID_LOGO_TYPE") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Logo must be a PNG, JPEG or WebP image." } }, { status: 400 });
  if (error instanceof Error && error.message === "LOGO_TOO_LARGE") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Logo must be 2.5MB or smaller." } }, { status: 400 });
  if (error instanceof Error && error.message === "INVALID_ATTACHMENT_TYPE") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "That file type is not allowed." } }, { status: 400 });
  if (error instanceof Error && error.message === "ATTACHMENT_TOO_LARGE") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "File is too large." } }, { status: 400 });
  if (error instanceof Error && error.message === "EMPTY_ATTACHMENT") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "File is empty." } }, { status: 400 });
  if (error instanceof Error && error.message === "STORAGE_NOT_CONFIGURED") return NextResponse.json({ error: { code: "STORAGE_NOT_CONFIGURED", message: "File storage is not configured for this environment yet." } }, { status: 503 });
  // 2026-09-22 — self-service "change my password" and "forgot password"
  // (src/lib/account/service.ts, src/lib/auth/password-reset-service.ts).
  if (error instanceof Error && error.message === "INVALID_CURRENT_PASSWORD") return NextResponse.json({ error: { code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect." } }, { status: 400 });
  if (error instanceof Error && error.message === "INVALID_RESET_TOKEN") return NextResponse.json({ error: { code: "INVALID_RESET_TOKEN", message: "This reset link is invalid or has expired. Request a new one." } }, { status: 400 });
  console.error("Unhandled API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } }, { status: 500 });
}
