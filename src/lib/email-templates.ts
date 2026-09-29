import { prisma } from "@/lib/prisma";

// Supplier email templates — added 2026-09-29 at the user's request
// ("Create a template tab under settings which allows me to edit the
// message/email sent to suppliers, add/edit a signature field, change
// sending from email address etc."). Both the RFQ-request email
// (rfq/service.ts's attemptRfqSend, formerly a hardcoded buildRfqEmailBody)
// and the parts-follow-up email (jobs/parts-followup.ts's
// buildFollowupEmailBody) now render through here instead of building their
// own text inline, so a Company Administrator can customize either message
// — and the shared signature — from Settings > Templates
// (CompanyTemplatesForm.tsx) without touching code.
//
// Placeholder syntax is deliberately simple: {{fieldName}} tags, replaced
// by renderTemplate below. Nothing fancier (no conditionals/loops) — the
// two emails this drives are short, fixed-shape messages, not a general
// templating need.
//
// Every DEFAULT_* constant below is exactly the text each email used to
// hard-code, split into a subject/body/signature that reassembles to the
// same output byte-for-byte (see buildRfqEmailMessage/
// buildFollowupEmailMessage's comments) — so a company that's never opened
// the Templates tab sees zero change in what gets sent.

export type EmailTemplateVars = Record<string, string>;

export type CompanyEmailTemplates = {
  rfqSubject: string | null;
  rfqBody: string | null;
  followupSubject: string | null;
  followupBody: string | null;
  signature: string | null;
};

export const DEFAULT_RFQ_SUBJECT = "Request for quote — Job {{jobNumber}}";
export const DEFAULT_RFQ_BODY = [
  "Hi {{supplierName}},",
  "",
  "Could you please quote on the following parts for job {{jobNumber}} ({{machine}})?",
  "",
  "{{partsList}}",
  "",
  "Please reply with pricing and availability at your earliest convenience.",
].join("\n");
export const RFQ_PLACEHOLDERS = ["supplierName", "jobNumber", "machine", "partsList"] as const;

export const DEFAULT_FOLLOWUP_SUBJECT = "Follow-up — outstanding parts for Job {{jobNumber}}";
export const DEFAULT_FOLLOWUP_BODY = [
  "Hi {{supplierName}},",
  "",
  "Following up on the parts still outstanding for job {{jobNumber}}:",
  "",
  "{{partsList}}",
  "",
  "Please could you let us know an updated ETA for these?",
].join("\n");
export const FOLLOWUP_PLACEHOLDERS = ["supplierName", "jobNumber", "partsList"] as const;

export const DEFAULT_SIGNATURE = "Thank you.";

export function renderTemplate(template: string, vars: EmailTemplateVars): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

export async function getCompanyEmailTemplates(companyId: string): Promise<CompanyEmailTemplates> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { rfqEmailSubject: true, rfqEmailBody: true, followupEmailSubject: true, followupEmailBody: true, emailSignature: true },
  });
  return {
    rfqSubject: settings?.rfqEmailSubject ?? null,
    rfqBody: settings?.rfqEmailBody ?? null,
    followupSubject: settings?.followupEmailSubject ?? null,
    followupBody: settings?.followupEmailBody ?? null,
    signature: settings?.emailSignature ?? null,
  };
}

// vars needs supplierName, jobNumber, machine, partsList (see
// RFQ_PLACEHOLDERS). Reassembles to the exact original hardcoded text when
// templates.rfqSubject/rfqBody/signature are all unset: DEFAULT_RFQ_BODY
// already ends right before the old trailing blank-line + "Thank you.", and
// this appends `["", signature || DEFAULT_SIGNATURE]` to put it straight
// back.
export function buildRfqEmailMessage(templates: CompanyEmailTemplates, vars: EmailTemplateVars) {
  const subject = renderTemplate(templates.rfqSubject || DEFAULT_RFQ_SUBJECT, vars);
  const body = renderTemplate(templates.rfqBody || DEFAULT_RFQ_BODY, vars);
  const text = [body, "", templates.signature || DEFAULT_SIGNATURE].join("\n");
  return { subject, text };
}

// vars needs supplierName, jobNumber, partsList (see FOLLOWUP_PLACEHOLDERS).
// Same byte-for-byte-compatible-when-unset reasoning as buildRfqEmailMessage.
export function buildFollowupEmailMessage(templates: CompanyEmailTemplates, vars: EmailTemplateVars) {
  const subject = renderTemplate(templates.followupSubject || DEFAULT_FOLLOWUP_SUBJECT, vars);
  const body = renderTemplate(templates.followupBody || DEFAULT_FOLLOWUP_BODY, vars);
  const text = [body, "", templates.signature || DEFAULT_SIGNATURE].join("\n");
  return { subject, text };
}
