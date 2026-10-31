import { prisma } from "@/lib/prisma";
import {
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
  DEFAULT_RFQ_BODY,
  DEFAULT_RFQ_SUBJECT,
  DEFAULT_SIGNATURE,
  DEFAULT_WIP_BODY,
  DEFAULT_WIP_SUBJECT,
  parseCcList,
} from "@/lib/email-template-fields";

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
// 2026-10-30: Settings > Templates was redesigned - every email now offers the job, machine, component, commercial and sender fields
// (see email-template-fields.ts for the list and lib/email-template-vars.ts for where each value comes from).
//
// Placeholder syntax is deliberately simple: {{fieldName}} tags, replaced
// by renderTemplate below. Nothing fancier (no conditionals/loops) — the
// two emails this drives are short, fixed-shape messages, not a general
// templating need.
//
// The signature is filled in too ({{senderName}}, {{company}}, {{companyPhone}}), so it can sign off with the sender's own name.
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
  wipSubject: string | null;
  wipBody: string | null;
  signature: string | null;
  // 2026-10-31: addresses copied on every email of that template (comma-separated).
  rfqCc?: string | null;
  followupCc?: string | null;
  wipCc?: string | null;
};

// The default wording of every email, and the list of fields each one can use, live in email-template-fields.ts (shared with the
// Templates page). They are re-exported here so the code that sends the emails keeps one import.
export {
  DEFAULT_RFQ_SUBJECT,
  DEFAULT_RFQ_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_WIP_SUBJECT,
  DEFAULT_WIP_BODY,
  DEFAULT_SIGNATURE,
};

// The CC list saved for a template, tidied (valid addresses only, comma-separated; "" when nobody is copied).
function ccList(raw: string | null | undefined): string {
  return parseCcList(raw).valid.join(", ");
}

export function renderTemplate(template: string, vars: EmailTemplateVars): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => vars[key] ?? "");
}

export async function getCompanyEmailTemplates(companyId: string): Promise<CompanyEmailTemplates> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: { rfqEmailSubject: true, rfqEmailBody: true, followupEmailSubject: true, followupEmailBody: true, wipEmailSubject: true, wipEmailBody: true, emailSignature: true, rfqEmailCc: true, followupEmailCc: true, wipEmailCc: true },
  });
  return {
    rfqSubject: settings?.rfqEmailSubject ?? null,
    rfqBody: settings?.rfqEmailBody ?? null,
    followupSubject: settings?.followupEmailSubject ?? null,
    followupBody: settings?.followupEmailBody ?? null,
    wipSubject: settings?.wipEmailSubject ?? null,
    wipBody: settings?.wipEmailBody ?? null,
    signature: settings?.emailSignature ?? null,
    rfqCc: settings?.rfqEmailCc ?? null,
    followupCc: settings?.followupEmailCc ?? null,
    wipCc: settings?.wipEmailCc ?? null,
  };
}

// vars: any of the supplier / job / machine / component / commercial / company fields (see
// EMAIL_TEMPLATE_GROUPS.rfq). Reassembles to the exact original hardcoded text when
// templates.rfqSubject/rfqBody/signature are all unset: DEFAULT_RFQ_BODY
// already ends right before the old trailing blank-line + "Thank you.", and
// this appends `["", signature || DEFAULT_SIGNATURE]` to put it straight
// back.
export function buildRfqEmailMessage(templates: CompanyEmailTemplates, vars: EmailTemplateVars) {
  const subject = renderTemplate(templates.rfqSubject || DEFAULT_RFQ_SUBJECT, vars);
  const body = renderTemplate(templates.rfqBody || DEFAULT_RFQ_BODY, vars);
  const text = [body, "", renderTemplate(templates.signature || DEFAULT_SIGNATURE, vars)].join("\n");
  return { subject, text, cc: ccList(templates.rfqCc) };
}

// vars: the same fields as the RFQ email (see EMAIL_TEMPLATE_GROUPS.followup).
// Same byte-for-byte-compatible-when-unset reasoning as buildRfqEmailMessage.
export function buildFollowupEmailMessage(templates: CompanyEmailTemplates, vars: EmailTemplateVars) {
  const subject = renderTemplate(templates.followupSubject || DEFAULT_FOLLOWUP_SUBJECT, vars);
  const body = renderTemplate(templates.followupBody || DEFAULT_FOLLOWUP_BODY, vars);
  const text = [body, "", renderTemplate(templates.signature || DEFAULT_SIGNATURE, vars)].join("\n");
  return { subject, text, cc: ccList(templates.followupCc) };
}

// vars: the list and company fields (see EMAIL_TEMPLATE_GROUPS.wip). `note` is the optional line the sender types in the Email
// window; it goes between the message and the signature.
export function buildWipTableEmailMessage(templates: CompanyEmailTemplates, vars: EmailTemplateVars, note = "") {
  const subject = renderTemplate(templates.wipSubject || DEFAULT_WIP_SUBJECT, vars).replace(/\s+/g, " ").trim();
  const body = renderTemplate(templates.wipBody || DEFAULT_WIP_BODY, vars).replace(/\n{3,}/g, "\n\n").trim();
  const text = [body, ...(note.trim() ? ["", note.trim()] : []), "", renderTemplate(templates.signature || DEFAULT_SIGNATURE, vars)].join("\n");
  return { subject, text, cc: ccList(templates.wipCc) };
}
