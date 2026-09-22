import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";

// Per-company outbound email — added 2026-09-09 to send real RFQ-request
// and Parts-follow-up emails, mirroring ModApp's per-company SMTP settings
// (isCompanyEmailConfigured/sendEmail in its own lib/email.ts). A Company
// Administrator enters host/port/username/password/from-address under
// Settings (see CompanySettingsForm.tsx's "Email / SMTP" section) — there
// is no app-wide fallback, so two companies on the same Apollo X instance
// never share a mailbox.
//
// Uses nodemailer rather than a hand-rolled SMTP client: this session has
// no way to open a live SMTP connection to test against, so a well-tested
// library is far lower-risk than raw sockets that have never actually
// sent a message. Requires `npm install nodemailer @types/nodemailer` —
// added to package.json but not run from this session (no shell access
// to the user's machine here).

export type OutboundAttachment = { filename: string; content: Buffer; contentType?: string };

type SmtpSettings = {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUsername: string | null;
  smtpPassword: string | null;
  smtpFromAddress: string | null;
  smtpFromName: string | null;
};

async function getSmtpSettings(companyId: string): Promise<SmtpSettings | null> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { smtpHost: true, smtpPort: true, smtpSecure: true, smtpUsername: true, smtpPassword: true, smtpFromAddress: true, smtpFromName: true },
  });
  return settings ?? null;
}

function isConfigured(settings: SmtpSettings | null): settings is SmtpSettings & { smtpHost: string; smtpUsername: string; smtpPassword: string; smtpFromAddress: string } {
  return !!(settings?.smtpHost && settings.smtpUsername && settings.smtpPassword && settings.smtpFromAddress);
}

export async function isCompanyEmailConfigured(companyId: string): Promise<boolean> {
  return isConfigured(await getSmtpSettings(companyId));
}

// Throws EMAIL_NOT_CONFIGURED (caught by callers and turned into a
// FAILED/lastSendError on the relevant record) rather than a raw
// nodemailer error when nothing's been entered under Settings yet.
export async function sendEmail(companyId: string, input: { to: string; subject: string; text: string; html?: string; attachments?: OutboundAttachment[] }): Promise<void> {
  const settings = await getSmtpSettings(companyId);
  if (!isConfigured(settings)) throw new Error("EMAIL_NOT_CONFIGURED");

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort ?? 587,
    secure: settings.smtpSecure,
    auth: { user: settings.smtpUsername, pass: settings.smtpPassword },
  });

  await transporter.sendMail({
    from: settings.smtpFromName ? { name: settings.smtpFromName, address: settings.smtpFromAddress } : settings.smtpFromAddress,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });
}

// 2026-09-22 — platform-wide counterpart of the per-company sendEmail
// above, added for the forgot-password flow (auth/password-reset-
// service.ts): a reset email has to go out before any company is chosen,
// so it can't depend on one specific tenant's SMTP settings the way an RFQ
// email can. Reads PlatformSettings' one singleton row (id "platform")
// instead of a companyId — see that model's comment in schema.prisma.
async function getPlatformSmtpSettings(): Promise<SmtpSettings | null> {
  const settings = await prisma.platformSettings.findUnique({
    where: { id: "platform" },
    select: { smtpHost: true, smtpPort: true, smtpSecure: true, smtpUsername: true, smtpPassword: true, smtpFromAddress: true, smtpFromName: true },
  });
  return settings ?? null;
}

export async function isPlatformEmailConfigured(): Promise<boolean> {
  return isConfigured(await getPlatformSmtpSettings());
}

// Throws EMAIL_NOT_CONFIGURED just like sendEmail — callers decide how to
// handle it (the forgot-password flow deliberately swallows it, since a
// reset request must never reveal, via a 500 vs. a silent success, whether
// email delivery is even configured).
export async function sendPlatformEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const settings = await getPlatformSmtpSettings();
  if (!isConfigured(settings)) throw new Error("EMAIL_NOT_CONFIGURED");

  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort ?? 587,
    secure: settings.smtpSecure,
    auth: { user: settings.smtpUsername, pass: settings.smtpPassword },
  });

  await transporter.sendMail({
    from: settings.smtpFromName ? { name: settings.smtpFromName, address: settings.smtpFromAddress } : settings.smtpFromAddress,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
