import type { RequestContext } from "@/lib/auth/context-types";
import { AuthorizationError, requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit/service";
import { renderDocumentPdf, type DocBlock } from "@/lib/documents/pdf";
import { sendEmail } from "@/lib/email";
import { buildWipTableEmailMessage, getCompanyEmailTemplates } from "@/lib/email-templates";
import { ccForSend } from "@/lib/email-template-fields";
import { loadCompanyEmailVars } from "@/lib/email-template-vars";
import { emailTableInput } from "@/lib/jobs/validation";
import { getCompanyLetterhead } from "@/lib/master-data/company-settings-service";
import { columnWeights, parseRecipients } from "@/lib/jobs/wip-email-helpers";

// 2026-10-20, user request: "add a button on the job wip table next to print called Email, this will save the current table view as PDF
// and email it to the requested email address" (+ "add template fields to customize the email sent").
//
// The browser sends exactly what is on screen (the headers and the visible rows, after the user's filters, search and saved columns -
// the same data the Print button prints). This builds an A4 landscape PDF with the company letterhead and emails it through the
// company's own SMTP settings, with the subject/message/signature from Settings > Templates. Nothing is stored.

const MAX_PDF_BYTES = 8_000_000;

export async function emailJobsWipTable(ctx: RequestContext, raw: unknown) {
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  if (ctx.tenantRole === "WIP_VIEWER") throw new AuthorizationError();
  const companyId = ctx.companyId!;
  const input = emailTableInput.parse(raw);
  const recipients = parseRecipients(input.to);

  const letterhead = await getCompanyLetterhead(ctx);
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-ZA", { timeZone: "Africa/Johannesburg" });
  const count = `${input.rows.length} ${input.rows.length === 1 ? "job" : "jobs"}`;
  const filters = input.filters || "No filters (all jobs)";
  const columns = input.headers.length;
  const rows = input.rows.map((row) => Array.from({ length: columns }, (_, i) => row[i] ?? ""));
  const blocks: DocBlock[] = [
    { type: "paragraph", text: filters },
    input.rows.length === 0
      ? { type: "paragraph", text: "Nothing to show - no jobs match the current filters." }
      : { type: "table", headers: input.headers, rows, widths: columnWeights(input.headers, rows), size: columns <= 8 ? 9 : columns <= 14 ? 8 : 7 },
  ];
  const pdf = await renderDocumentPdf({ title: input.title, landscape: true, rightLines: [count, dateLabel], blocks }, letterhead);
  if (pdf.length > MAX_PDF_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");

  const company = letterhead?.name ?? "";
  const templates = await getCompanyEmailTemplates(companyId);
  // The company phone and the sender's name come from the shared company fields; `company` and `date` keep the wording this email always used.
  const companyVars = await loadCompanyEmailVars(companyId, ctx.displayName);
  const message = buildWipTableEmailMessage(templates, { ...companyVars, title: input.title, company, date: dateLabel, count, filters }, input.note);
  const stamp = now.toISOString().slice(0, 10);
  const fileName = `${input.title} - ${stamp}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");

  try {
    await sendEmail(companyId, { to: recipients.join(", "), cc: ccForSend(message.cc, recipients.join(", ")), subject: message.subject, text: message.text, attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }] });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_NOT_CONFIGURED") throw error;
    console.error("Jobs & WIP table email failed", error);
    throw new Error("EMAIL_SEND_FAILED");
  }
  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobsWipTable", entityId: companyId, action: "EMAILED", afterData: { to: recipients, rows: input.rows.length, fileName } });
  return { ok: true, sentTo: recipients, fileName };
}
