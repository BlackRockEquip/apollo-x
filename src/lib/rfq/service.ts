import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit/service";
import { rfqRequestInput, rfqQuoteRecordInput, rfqQuoteLinesSaveInput, rfqPreferredInput, rfqNewSupplierRequestInput } from "@/lib/rfq/validation";
import { isCompanyEmailConfigured, sendEmail } from "@/lib/email";
import { guessPricesFromFile } from "@/lib/rfq/quote-extraction";
import { createMaster } from "@/lib/master-data/service";

// RFQ (request for quote) — new, added 2026-09-09 at the user's request
// ("add the RFQ from suppliers section of ModApp"). Updated the same day
// to add real email sending, price-guess extraction and inline supplier
// creation, per the user's explicit follow-up request ("add the below
// skipped functions" — see the RfqRequestStatus enum comment in
// schema.prisma for the SENT/FAILED/SKIPPED/QUOTED lifecycle this now
// drives). A supplier with no email configured, or when the company hasn't
// set up SMTP under Settings yet, falls back to the original SKIPPED
// behaviour — added to the comparison list with no send attempt.

const ALLOWED_QUOTE_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_QUOTE_FILE_BYTES = 8_000_000;

type JobActivityType = Prisma.JobActivityGetPayload<{ select: { type: true } }>["type"];

function notFound(): never {
  throw new Error("NOT_FOUND");
}

function requireJobsRead(ctx: RequestContext) {
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  return ctx.companyId!;
}

function requireJobsWrite(ctx: RequestContext) {
  requireModule(ctx, "JOBS_WIP", "WRITE");
  requireTenantPermission(ctx, "JOBS_EDIT");
  return ctx.companyId!;
}

async function addActivity(tx: Prisma.TransactionClient, ctx: RequestContext, jobId: string, type: JobActivityType, description: string, metadata?: Prisma.InputJsonValue) {
  await tx.jobActivity.create({
    data: { companyId: ctx.companyId!, jobId, type, description, metadata, actorId: ctx.userId },
  });
}

async function getRfqRequestScoped(companyId: string, jobId: string, rfqRequestId: string) {
  const rfq = await prisma.jobRfqRequest.findFirst({ where: { id: rfqRequestId, companyId, jobId }, include: { supplier: { select: { id: true, name: true } } } });
  if (!rfq) notFound();
  return rfq;
}

// Every part line on the job goes into the snapshot — not just the ones
// out of stock — so a supplier can quote the whole list in one go. Mirrors
// ModApp's buildPartsSummary.
async function buildPartsSummary(companyId: string, jobId: string) {
  const lines = await prisma.jobPartLine.findMany({ where: { companyId, jobId }, orderBy: { createdAt: "asc" } });
  if (lines.length === 0) return "No specific parts listed — please advise on general availability.";
  return lines.map((l) => `${l.partNumber} — ${l.description ?? "no description"} (qty ${l.quantity})`).join("\n");
}

function buildRfqEmailBody(job: { jobNumber: string | null; draftNumber: string; machineMake: string | null; machineModel: string | null }, supplierName: string, partsSummary: string) {
  const jobRef = job.jobNumber ?? job.draftNumber;
  const machine = [job.machineMake, job.machineModel].filter(Boolean).join(" ") || "the unit";
  const subject = `Request for quote — Job ${jobRef}`;
  const text = [
    `Hi ${supplierName},`,
    "",
    `Could you please quote on the following parts for job ${jobRef} (${machine})?`,
    "",
    partsSummary,
    "",
    "Please reply with pricing and availability at your earliest convenience.",
    "",
    "Thank you.",
  ].join("\n");
  return { subject, text };
}

// Builds the RFQ email's recipient list: the supplier's mainEmail plus any
// contact marked "Can receive RFQs" (SupplierContact.canReceiveRfq — added
// 2026-09-09 at the user's request so an RFQ can also reach a specific
// buyer/purchasing contact, not just the general inbox). Deduped and
// comma-joined — nodemailer's `to` field accepts that natively (see
// email.ts). Returns null when there's nobody to send to at all.
function rfqRecipients(supplier: { mainEmail: string | null; contacts?: Array<{ email: string | null }> }): string | null {
  const emails = [supplier.mainEmail, ...(supplier.contacts ?? []).map((c) => c.email)].filter((e): e is string => !!e);
  const unique = Array.from(new Set(emails));
  return unique.length ? unique.join(", ") : null;
}

// Attempts to send the RFQ email (when requested, and the supplier has at
// least one recipient — mainEmail or an RFQ-eligible contact — and the
// company has SMTP configured under Settings) and returns the status/error
// to persist. Never throws — a send failure is recorded as FAILED, not
// surfaced as an API error, so one bad supplier address doesn't block the
// rest of the request.
async function attemptRfqSend(companyId: string, jobId: string, sendEmailRequested: boolean, supplier: { name: string; mainEmail: string | null; contacts?: Array<{ email: string | null }> }, partsSummary: string): Promise<{ status: "SENT" | "FAILED" | "SKIPPED"; lastSendError: string | null }> {
  if (!sendEmailRequested) return { status: "SKIPPED", lastSendError: null };
  const to = rfqRecipients(supplier);
  if (!to) return { status: "SKIPPED", lastSendError: null };
  if (!(await isCompanyEmailConfigured(companyId))) return { status: "SKIPPED", lastSendError: null };

  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { jobNumber: true, draftNumber: true, machineMake: true, machineModel: true } });
  if (!job) return { status: "SKIPPED", lastSendError: null };

  const { subject, text } = buildRfqEmailBody(job, supplier.name, partsSummary);
  try {
    await sendEmail(companyId, { to, subject, text });
    return { status: "SENT", lastSendError: null };
  } catch (err) {
    const message = err instanceof Error && err.message !== "EMAIL_NOT_CONFIGURED" ? err.message.slice(0, 500) : "Could not send the email — check the SMTP settings under Settings.";
    return { status: "FAILED", lastSendError: message };
  }
}

// Adds a supplier to this job's RFQ/comparison list, sending a real RFQ
// email when requested and the company has SMTP set up (see
// attemptRfqSend above) — otherwise, or when input.sendEmail is false,
// falls back to the original "added to the list, no email attempted"
// SKIPPED behaviour, same real-world action as ModApp's phone/in-person
// path. Re-requesting the same supplier refreshes the parts-list snapshot
// and timestamp on the existing row rather than creating a duplicate. An
// existing QUOTED status is never downgraded by a re-request — a supplier
// who already sent pricing back doesn't need another email.
export async function requestRfqFromSupplier(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireJobsWrite(ctx);
  const input = rfqRequestInput.parse(raw);

  const job = await prisma.job.findFirst({ where: { id: jobId, companyId } });
  if (!job) notFound();
  const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, companyId, active: true }, select: { id: true, name: true, mainEmail: true, contacts: { where: { active: true, canReceiveRfq: true }, select: { email: true } } } });
  if (!supplier) notFound();

  const partsSummary = await buildPartsSummary(companyId, jobId);
  const existing = await prisma.jobRfqRequest.findUnique({ where: { jobId_supplierId: { jobId, supplierId: input.supplierId } }, select: { status: true } });

  const send = existing?.status === "QUOTED" ? { status: existing.status, lastSendError: null } : await attemptRfqSend(companyId, jobId, input.sendEmail, supplier, partsSummary);

  const rfq = await prisma.$transaction(async (tx) => {
    const record = await tx.jobRfqRequest.upsert({
      where: { jobId_supplierId: { jobId, supplierId: input.supplierId } },
      create: { companyId, jobId, supplierId: input.supplierId, partsSummary, status: send.status, lastSendError: send.lastSendError, createdById: ctx.userId, updatedById: ctx.userId },
      update: { partsSummary, requestedAt: new Date(), status: send.status, lastSendError: send.lastSendError, updatedById: ctx.userId },
      include: { supplier: { select: { id: true, name: true } } },
    });
    const description = send.status === "SENT" ? `Quote request emailed to ${supplier.name}.` : send.status === "FAILED" ? `Quote request to ${supplier.name} could not be emailed — added to the comparison list.` : send.status === "QUOTED" ? `Quote re-requested from ${supplier.name}.` : `${supplier.name} added to the comparison list (no email sent).`;
    await addActivity(tx, ctx, jobId, "RFQ_REQUESTED", description, { rfqRequestId: record.id, supplierId: supplier.id, status: send.status });
    return record;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobRfqRequest", entityId: rfq.id, action: "CREATE", afterData: { jobId, supplierId: input.supplierId, status: send.status } });
  return rfq;
}

// Retries the send for a request that previously came back FAILED, or
// sends for the first time for one that was added as SKIPPED — e.g. the
// supplier's email was added after the fact, or SMTP settings were just
// fixed. Refuses to touch a QUOTED request (nothing to resend).
export async function resendRfqRequest(ctx: RequestContext, jobId: string, rfqRequestId: string) {
  const companyId = requireJobsWrite(ctx);
  const rfq = await getRfqRequestScoped(companyId, jobId, rfqRequestId);
  if (rfq.status === "QUOTED") throw new Error("RFQ_ALREADY_QUOTED");

  const supplier = await prisma.supplier.findFirst({ where: { id: rfq.supplierId, companyId }, select: { name: true, mainEmail: true, contacts: { where: { active: true, canReceiveRfq: true }, select: { email: true } } } });
  if (!supplier) notFound();

  const send = await attemptRfqSend(companyId, jobId, true, supplier, rfq.partsSummary);
  if (send.status === "SKIPPED" && !rfqRecipients(supplier)) throw new Error("SUPPLIER_HAS_NO_EMAIL");
  if (send.status === "SKIPPED") throw new Error("EMAIL_NOT_CONFIGURED");

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.jobRfqRequest.update({
      where: { id: rfq.id },
      data: { status: send.status, lastSendError: send.lastSendError, requestedAt: new Date(), updatedById: ctx.userId },
      include: { supplier: { select: { id: true, name: true } } },
    });
    await addActivity(tx, ctx, jobId, "RFQ_REQUESTED", send.status === "SENT" ? `Quote request re-emailed to ${supplier.name}.` : `Retry failed — quote request to ${supplier.name} could not be emailed.`, { rfqRequestId: record.id, status: send.status });
    return record;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobRfqRequest", entityId: updated.id, action: "UPDATE", afterData: { jobId, rfqRequestId, status: send.status } });
  return updated;
}

// Creates a new Supplier (via the generic master-data path, so it gets the
// same normalization/validation as the Suppliers master-data screen — see
// createMaster in master-data/service.ts) and, in the same step, requests
// a quote from it — mirrors ModApp's inline "add a new supplier" form on
// the RFQ panel.
export async function addSupplierAndRequestRfq(ctx: RequestContext, jobId: string, raw: unknown) {
  requireJobsWrite(ctx);
  const input = rfqNewSupplierRequestInput.parse(raw);

  const supplier = await createMaster(ctx, "suppliers", { name: input.supplierName, mainEmail: input.supplierEmail || null });
  return requestRfqFromSupplier(ctx, jobId, { supplierId: supplier.id, sendEmail: input.sendEmail });
}

export async function removeRfqRequest(ctx: RequestContext, jobId: string, rfqRequestId: string) {
  const companyId = requireJobsWrite(ctx);
  const rfq = await getRfqRequestScoped(companyId, jobId, rfqRequestId);

  await prisma.$transaction(async (tx) => {
    await tx.jobRfqRequest.delete({ where: { id: rfq.id } });
    await addActivity(tx, ctx, jobId, "RFQ_REQUEST_REMOVED", `Quote request removed: ${rfq.supplier.name}.`, { rfqRequestId: rfq.id });
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobRfqRequest", entityId: rfq.id, action: "DELETE", afterData: { jobId, rfqRequestId } });
  return { ok: true };
}

function decodeQuoteFile(input: { fileName?: string | null; mimeType?: string | null; contentBase64?: string | null }) {
  if (!input.fileName || !input.mimeType || !input.contentBase64) return null;
  if (!ALLOWED_QUOTE_MIME_TYPES.includes(input.mimeType)) throw new Error("INVALID_ATTACHMENT_TYPE");
  const data = Buffer.from(input.contentBase64, "base64");
  if (data.length > MAX_QUOTE_FILE_BYTES) throw new Error("ATTACHMENT_TOO_LARGE");
  return { fileName: input.fileName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 160), mimeType: input.mimeType, data, sizeBytes: data.length };
}

// Records a supplier's quotation — an optional reference file (stored
// inline, same pattern as SupportTicketAttachment) plus notes. Marks the
// request QUOTED. Prices themselves are saved separately via
// saveRfqQuoteLines — this step is "the quote exists", not "here are the
// numbers". When a file was uploaded, best-effort price guesses are
// extracted (see rfq/quote-extraction.ts) and returned alongside the quote
// as `guesses` — a starting point for the price table, never persisted
// here; nothing is saved as a real price until saveRfqQuoteLines.
export async function recordRfqQuote(ctx: RequestContext, jobId: string, rfqRequestId: string, raw: unknown) {
  const companyId = requireJobsWrite(ctx);
  const input = rfqQuoteRecordInput.parse(raw);
  const rfq = await getRfqRequestScoped(companyId, jobId, rfqRequestId);

  const file = decodeQuoteFile(input);

  let guesses: Record<string, number> = {};
  if (file) {
    const partLines = await prisma.jobPartLine.findMany({ where: { companyId, jobId }, select: { id: true, partNumber: true } });
    try {
      const guessesByPartNumber = await guessPricesFromFile(file.data, file.fileName, partLines.map((l) => l.partNumber));
      for (const line of partLines) {
        if (guessesByPartNumber[line.partNumber] !== undefined) guesses[line.id] = guessesByPartNumber[line.partNumber];
      }
    } catch {
      // Extraction is best-effort — a parse failure just means no guesses,
      // never a failed quote record.
      guesses = {};
    }
  }

  const quote = await prisma.$transaction(async (tx) => {
    const record = await tx.jobRfqQuote.upsert({
      where: { rfqRequestId: rfq.id },
      create: {
        rfqRequestId: rfq.id,
        fileName: file?.fileName ?? null,
        mimeType: file?.mimeType ?? null,
        sizeBytes: file?.sizeBytes ?? null,
        data: file?.data ?? null,
        notes: input.notes ?? null,
        createdById: ctx.userId,
      },
      update: {
        ...(file ? { fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, data: file.data, receivedAt: new Date() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: { lines: true },
    });
    await tx.jobRfqRequest.update({ where: { id: rfq.id }, data: { status: "QUOTED", updatedById: ctx.userId } });
    await addActivity(tx, ctx, jobId, "RFQ_QUOTE_RECORDED", `Quote recorded from ${rfq.supplier.name}.`, { rfqRequestId: rfq.id, quoteId: record.id, hasFile: !!file });
    return record;
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobRfqQuote", entityId: quote.id, action: "CREATE", afterData: { jobId, rfqRequestId } });
  return { ...quote, guesses };
}

// Commits the prices a person has entered for one supplier's quote. This
// is the only place a price actually becomes "saved" for the comparison
// table — mirrors ModApp's saveRfqQuoteLines exactly, including the rule
// that an unavailable line's price is cleared rather than kept, and that
// this never touches `preferred` (see setPreferredQuoteLine below).
export async function saveRfqQuoteLines(ctx: RequestContext, jobId: string, rfqRequestId: string, raw: unknown) {
  const companyId = requireJobsWrite(ctx);
  const input = rfqQuoteLinesSaveInput.parse(raw);

  const quote = await prisma.jobRfqQuote.findFirst({ where: { rfqRequestId, rfqRequest: { companyId, jobId } }, include: { rfqRequest: { include: { supplier: { select: { name: true } } } } } });
  if (!quote) notFound();
  const rfqQuoteId = quote.id;

  await prisma.$transaction(async (tx) => {
    for (const line of input.lines) {
      const unitPrice = line.available ? (line.unitPrice != null ? new Prisma.Decimal(line.unitPrice) : null) : null;
      await tx.jobRfqQuoteLine.upsert({
        where: { rfqQuoteId_partLineId: { rfqQuoteId, partLineId: line.partLineId } },
        create: { rfqQuoteId, partLineId: line.partLineId, unitPrice, available: line.available, notes: line.notes ?? null },
        update: { unitPrice, available: line.available, notes: line.notes ?? null },
      });
    }
    await addActivity(tx, ctx, jobId, "RFQ_QUOTE_RECORDED", `Prices saved for ${quote.rfqRequest.supplier.name}'s quote (${input.lines.length} line${input.lines.length === 1 ? "" : "s"}).`, { rfqQuoteId, lineCount: input.lines.length });
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobRfqQuote", entityId: rfqQuoteId, action: "UPDATE_LINES", afterData: { jobId, rfqQuoteId, lineCount: input.lines.length } });
  return { ok: true };
}

// Toggles "buy this part from this supplier" in the comparison table. Only
// one supplier can be preferred per part at a time — picking a different
// supplier's price for the same part moves the flag; clicking the
// currently-preferred one again clears it. Independent of (and doesn't
// have to agree with) the automatic cheapest-price highlight. Mirrors
// ModApp's setPreferredQuoteLine, including auto-filling the part line's
// "ordered from" supplier — skipped once the line is already RECEIVED,
// same guard ModApp applies for its equivalent PICKED status.
export async function setPreferredQuoteLine(ctx: RequestContext, jobId: string, raw: unknown) {
  const companyId = requireJobsWrite(ctx);
  const input = rfqPreferredInput.parse(raw);

  const [lines, partLine] = await Promise.all([
    prisma.jobRfqQuoteLine.findMany({
      where: { partLineId: input.partLineId, rfqQuote: { rfqRequest: { companyId, jobId } } },
      include: { rfqQuote: { include: { rfqRequest: true } } },
    }),
    prisma.jobPartLine.findFirst({ where: { id: input.partLineId, companyId, jobId } }),
  ]);
  if (!partLine) notFound();

  const target = lines.find((l) => l.rfqQuoteId === input.rfqQuoteId);
  if (!target || target.unitPrice === null || !target.available) throw new Error("RFQ_LINE_NOT_QUOTED");

  const nowPreferred = !target.preferred;
  const shouldAutoFillSupplier = nowPreferred && partLine.status !== "RECEIVED";

  await prisma.$transaction(async (tx) => {
    for (const l of lines) {
      if (l.id !== target.id && l.preferred) await tx.jobRfqQuoteLine.update({ where: { id: l.id }, data: { preferred: false } });
    }
    await tx.jobRfqQuoteLine.update({ where: { id: target.id }, data: { preferred: nowPreferred } });
    if (shouldAutoFillSupplier) {
      await tx.jobPartLine.update({ where: { id: input.partLineId }, data: { orderedFromSupplierId: target.rfqQuote.rfqRequest.supplierId } });
    }
    await addActivity(tx, ctx, jobId, "RFQ_PREFERRED_SUPPLIER_SET", nowPreferred ? `${partLine.partNumber}: preferred supplier set.` : `${partLine.partNumber}: preferred supplier cleared.`, { partLineId: input.partLineId, rfqQuoteId: input.rfqQuoteId, preferred: nowPreferred });
  });

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "JobRfqQuoteLine", entityId: target.id, action: "SET_PREFERRED", afterData: { jobId, partLineId: input.partLineId, rfqQuoteId: input.rfqQuoteId, preferred: nowPreferred } });
  return { ok: true, preferred: nowPreferred };
}

// Hands back the uploaded quote file as base64 so the client can build a
// data: URL to view/download it — Apollo X's API convention here is JSON
// responses, so this avoids a separate raw-binary route.
export async function getRfqQuoteFile(ctx: RequestContext, jobId: string, rfqRequestId: string) {
  const companyId = requireJobsRead(ctx);
  const rfq = await getRfqRequestScoped(companyId, jobId, rfqRequestId);
  const quote = await prisma.jobRfqQuote.findUnique({ where: { rfqRequestId: rfq.id } });
  if (!quote || !quote.data || !quote.fileName || !quote.mimeType) throw new Error("NO_QUOTE_FILE");
  return { fileName: quote.fileName, mimeType: quote.mimeType, contentBase64: quote.data.toString("base64") };
}
