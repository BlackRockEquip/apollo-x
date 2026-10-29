import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth/guards";
import { Prisma } from "@prisma/client";
import { DEMO_READ_ONLY_CODE, DEMO_READ_ONLY_MESSAGE, DemoReadOnlyError } from "@/lib/demo/mode";

export class StockError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "StockError";
  }
}

// 2026-09-29 — SMTP "Test connection" button (company-settings-service.ts's
// testCompanySmtpConnection). A failed test isn't really a 5xx server
// error and isn't a Zod validation error either — it's the SMTP server (or
// the network) rejecting the attempt, and the whole point of the button is
// to show the caller *why* (bad credentials, wrong host, TLS mismatch,
// etc.), so this carries nodemailer's own message straight through rather
// than collapsing it into a generic string.
export class SmtpTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpTestError";
  }
}

export function apiError(error: unknown) {
  if (error instanceof StockError) return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: 409 });
  if (error instanceof SmtpTestError) return NextResponse.json({ error: { code: "SMTP_TEST_FAILED", message: error.message } }, { status: 422 });
  if (error instanceof AuthorizationError) return NextResponse.json({ error: { code: "FORBIDDEN", message: error.message } }, { status: 403 });
  // 2026-10-29: public view-only demo - the database refused a write (src/lib/prisma.ts, src/lib/demo/mode.ts).
  if (error instanceof DemoReadOnlyError) return NextResponse.json({ error: { code: DEMO_READ_ONLY_CODE, message: DEMO_READ_ONLY_MESSAGE } }, { status: 403, headers: { "x-demo-read-only": "1" } });
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
  if (error instanceof Error && error.message === "STORAGE_FILE_MISSING") return NextResponse.json({ error: { code: "STORAGE_FILE_MISSING", message: "This file is not in the current storage location. An administrator needs to import the exported files (Platform > Companies > Storage location)." } }, { status: 404 });
  if (error instanceof Error && error.message === "STORAGE_SECRET_UNREADABLE") return NextResponse.json({ error: { code: "STORAGE_SECRET_UNREADABLE", message: "File storage needs its secret key re-entered by a platform administrator." } }, { status: 503 });
  if (error instanceof Error && error.message === "STORAGE_NOT_CONFIGURED") return NextResponse.json({ error: { code: "STORAGE_NOT_CONFIGURED", message: "File storage is not configured for this environment yet." } }, { status: 503 });
  // 2026-09-22 — self-service "change my password" and "forgot password"
  // (src/lib/account/service.ts, src/lib/auth/password-reset-service.ts).
  // 2026-10-19, security review: a login can be shared across companies / the platform (users/service.ts).
  if (error instanceof Error && error.message === "EMAIL_UNAVAILABLE") return NextResponse.json({ error: { code: "EMAIL_UNAVAILABLE", message: "That email address can't be added from here. If this person already has a login for another company, ask a platform administrator to add them." } }, { status: 409 });
  if (error instanceof Error && error.message === "SHARED_IDENTITY_PROTECTED") return NextResponse.json({ error: { code: "SHARED_IDENTITY_PROTECTED", message: "This person's login is also used for another company (or the platform), so only a platform administrator can change their name, password or sign-in status. You can still change their role and module access here." } }, { status: 409 });
  if (error instanceof Error && error.message === "INVALID_CURRENT_PASSWORD") return NextResponse.json({ error: { code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect." } }, { status: 400 });
  if (error instanceof Error && error.message === "INVALID_RESET_TOKEN") return NextResponse.json({ error: { code: "INVALID_RESET_TOKEN", message: "This reset link is invalid or has expired. Request a new one." } }, { status: 400 });
  // 2026-09-22 — Platform Admin: Modules delete safeguard
  // (module-catalog-service.ts) and the "no organization admin/user can
  // become a platform administrator" safeguard (platform/admin-service.ts).
  // 2026-10-16 — Industry build tab (platform/industry-build-service.ts).
  if (error instanceof Error && error.message === "BLACK_ROCK_ENTITLEMENT_PROTECTED") return NextResponse.json({ error: { code: "BLACK_ROCK_ENTITLEMENT_PROTECTED", message: "Black Rock is protected: its modules come from an internal policy and cannot be changed here." } }, { status: 403 });
  if (error instanceof Error && error.message === "INDUSTRY_BUILD_UNKNOWN_TILE") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "That module is not part of any industry build." } }, { status: 400 });
  if (error instanceof Error && error.message === "INVALID_INDUSTRY_BUILD") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Pick one of the listed industry builds." } }, { status: 400 });
  if (error instanceof Error && error.message === "EXPIRY_BEFORE_START") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "A module's expiry date cannot be before its effective-from date." } }, { status: 400 });
  if (error instanceof Error && error.message === "BROADCAST_NO_RECIPIENTS") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Nobody can receive that. The chosen companies or users have no active members (suspended companies are skipped)." } }, { status: 400 });
  if (error instanceof Error && error.message === "PLATFORM_CONTEXT_REQUIRED") return NextResponse.json({ error: { code: "FORBIDDEN", message: "Leave the company's support context to manage platform settings." } }, { status: 403 });
  // 2026-10-21 — Platform > Proposals (proposals/service.ts).
  if (error instanceof Error && error.message === "PROPOSAL_NUMBER_TAKEN") return NextResponse.json({ error: { code: "PROPOSAL_NUMBER_TAKEN", message: "Another proposal already uses that quote number — type a different one." } }, { status: 409 });
  if (error instanceof Error && error.message === "PROPOSAL_NUMBER_UNAVAILABLE") return NextResponse.json({ error: { code: "PROPOSAL_NUMBER_UNAVAILABLE", message: "Could not reserve a quote number - please try saving again." } }, { status: 409 });
  if (error instanceof Error && error.message === "MODULE_HAS_ACTIVE_ENTITLEMENTS") return NextResponse.json({ error: { code: "MODULE_HAS_ACTIVE_ENTITLEMENTS", message: "This module is still actively entitled to at least one company. Revoke its entitlements first (Platform > Companies > that company > Modules) before deleting it from the catalog." } }, { status: 409 });
  if (error instanceof Error && error.message === "ORG_MEMBER_CANNOT_BE_PLATFORM_ADMIN") return NextResponse.json({ error: { code: "ORG_MEMBER_CANNOT_BE_PLATFORM_ADMIN", message: "This person already belongs to a company (an organization admin or user). Platform authority can't be granted to, or reactivated for, an active company member — remove their company membership first if they genuinely need platform access." } }, { status: 409 });
  if (error instanceof Error && error.message === "LAST_PLATFORM_ADMIN_REQUIRED") return NextResponse.json({ error: { code: "LAST_PLATFORM_ADMIN_REQUIRED", message: "At least one active Platform Admin must remain — this change would leave none." } }, { status: 409 });
  if (error instanceof Error && error.message === "RESOURCE_NOT_FOUND") return NextResponse.json({ error: { code: "NOT_FOUND", message: "No user was found with that email. To add a new person, enter their name and a starting password as well." } }, { status: 404 });
  if (error instanceof Error && error.message === "PASSWORD_TOO_SHORT") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Enter a starting password of at least 8 characters." } }, { status: 400 });
  if (error instanceof Error && error.message === "EMAIL_REQUIRED") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Email is required." } }, { status: 400 });
  if (error instanceof Error && error.message === "INVALID_EMAIL") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Enter a valid email address." } }, { status: 400 });
  if (error instanceof Error && error.message === "DISPLAY_NAME_TOO_SHORT") return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Name must be at least 2 characters." } }, { status: 400 });
  // 2026-09-29 — alternate (superseded/group) part numbers
  // (master-data/service.ts's addPartAlternateNumber).
  if (error instanceof Error && error.message === "PART_NUMBER_ALREADY_IN_USE") return NextResponse.json({ error: { code: "PART_NUMBER_ALREADY_IN_USE", message: "That number is already in use — either as another part's own part number, or as an alternate number already recorded against a part." } }, { status: 409 });
  // 2026-09-29, user report: "on RFQ form inside a job, when resending an
  // email (Clicking retry) no confirmation or notification is displayed" —
  // resendRfqRequest (rfq/service.ts) already threw these three, but none
  // were mapped here, so a retry that couldn't actually be attempted (no
  // recipient, no SMTP set up, or a request that's already QUOTED) fell
  // through to the generic 500 "could not be completed" message, which is
  // exactly the kind of unhelpful non-feedback that report was about.
  if (error instanceof Error && error.message === "RFQ_ALREADY_QUOTED") return NextResponse.json({ error: { code: "RFQ_ALREADY_QUOTED", message: "This supplier already sent back a quote — nothing to resend." } }, { status: 409 });
  if (error instanceof Error && error.message === "SUPPLIER_HAS_NO_EMAIL") return NextResponse.json({ error: { code: "SUPPLIER_HAS_NO_EMAIL", message: "This supplier has no email address on file — add one on the Suppliers screen first." } }, { status: 409 });
  if (error instanceof Error && error.message === "EMAIL_NOT_CONFIGURED") return NextResponse.json({ error: { code: "EMAIL_NOT_CONFIGURED", message: "Email isn't set up for this company yet — add SMTP details under Settings > Company / Branding first." } }, { status: 409 });
  if (error instanceof Error && error.message === "SMTP_PASSWORD_REQUIRED") return NextResponse.json({ error: { code: "SMTP_PASSWORD_REQUIRED", message: "Enter the SMTP password (or save it first) before testing the connection." } }, { status: 400 });
  // 2026-10-09 — Settings > Users > Delete (users/service.ts deleteTenantUser).
  if (error instanceof Error && error.message === "CANNOT_DELETE_SELF") return NextResponse.json({ error: { code: "CANNOT_DELETE_SELF", message: "You can't delete your own account. Ask another admin to do it." } }, { status: 409 });
  if (error instanceof Error && error.message === "LAST_COMPANY_ADMIN_REQUIRED") return NextResponse.json({ error: { code: "LAST_COMPANY_ADMIN_REQUIRED", message: "This is the last active Company Admin. Make another user a Company Admin first, then delete this one." } }, { status: 409 });
  // 2026-10-05 — job part line actions (jobs/service.ts) used to throw bare
  // codes that fell through to the generic 500 below, so a failed Mark
  // received / Undo receive just said "The request could not be completed."
  if (error instanceof Error && error.message === "PART_LINE_ALREADY_FULLY_RECEIVED") return NextResponse.json({ error: { code: "PART_LINE_ALREADY_FULLY_RECEIVED", message: "This part line is already fully received." } }, { status: 409 });
  if (error instanceof Error && error.message === "PART_LINE_RECEIVE_EXCEEDS_OUTSTANDING") return NextResponse.json({ error: { code: "PART_LINE_RECEIVE_EXCEEDS_OUTSTANDING", message: "That is more than is still outstanding on this part line." } }, { status: 409 });
  if (error instanceof Error && error.message === "PART_LINE_ALREADY_HAS_DESCRIPTION") return NextResponse.json({ error: { code: "PART_LINE_ALREADY_HAS_DESCRIPTION", message: "This part line already has a description." } }, { status: 409 });
  // 2026-10-16 — Document numbering + Settings > Users (master-data/service.ts, users/service.ts).
  if (error instanceof Error && error.message === "LOCATION_CODE_EXISTS") return NextResponse.json({ error: { code: "LOCATION_CODE_EXISTS", message: "A storage location with that code already exists. Use a different code." } }, { status: 409 });
  if (error instanceof Error && error.message === "LOCATION_CODE_EXISTS_INACTIVE") return NextResponse.json({ error: { code: "LOCATION_CODE_EXISTS_INACTIVE", message: "A storage location with that code already exists but is inactive (deleted locations that are still in use are kept as inactive). Set the status filter to All or Inactive to find and reactivate it, or use a different code." } }, { status: 409 });
  if (error instanceof Error && error.message === "SEQUENCE_TYPE_EXISTS") return NextResponse.json({ error: { code: "SEQUENCE_TYPE_EXISTS", message: "A numbering sequence for that document type already exists. Edit the existing one instead." } }, { status: 409 });
  if (error instanceof Error && error.message === "ROLE_NOT_ALLOWED") return NextResponse.json({ error: { code: "ROLE_NOT_ALLOWED", message: "That user type is not available for this company." } }, { status: 400 });
  // 2026-10-20 - Email button on the Jobs & WIP table (jobs/wip-email.ts).
  if (error instanceof Error && error.message === "INVALID_RECIPIENTS") return NextResponse.json({ error: { code: "INVALID_RECIPIENTS", message: "Enter a valid email address (up to 5, separated by commas)." } }, { status: 400 });
  if (error instanceof Error && error.message === "EMAIL_SEND_FAILED") return NextResponse.json({ error: { code: "EMAIL_SEND_FAILED", message: "The email could not be sent - check the email settings under Settings > Company / Branding." } }, { status: 502 });
  console.error("Unhandled API error", error);
  return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } }, { status: 500 });
}
