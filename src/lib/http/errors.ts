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
  console.error("Unhandled API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } }, { status: 500 });
}
