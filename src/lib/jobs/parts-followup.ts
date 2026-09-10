import { Prisma } from "@prisma/client";
import type { RequestContext } from "@/lib/auth/context-types";
import { requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit/service";
import { isCompanyEmailConfigured, sendEmail } from "@/lib/email";

// Parts follow-up — new, added 2026-09-09 at the user's request ("ModApp's
// separate 'Parts follow-up' chase-email feature wasn't built"). Scoped
// down from ModApp's per-supplier/per-part-line follow-up UI to a single
// bulk action: "send a follow-up to every supplier with outstanding
// ordered parts on this job" — one email per supplier, listing everything
// still outstanding from them. A more granular per-line follow-up can be
// added later if the simpler version isn't enough.

type JobActivityType = Prisma.JobActivityGetPayload<{ select: { type: true } }>["type"];

function requireJobsWrite(ctx: RequestContext) {
  requireModule(ctx, "JOBS_WIP", "WRITE");
  requireTenantPermission(ctx, "JOBS_EDIT");
  return ctx.companyId!;
}

function notFound(): never {
  throw new Error("NOT_FOUND");
}

async function addActivity(tx: Prisma.TransactionClient, ctx: RequestContext, jobId: string, type: JobActivityType, description: string, metadata?: Prisma.InputJsonValue) {
  await tx.jobActivity.create({
    data: { companyId: ctx.companyId!, jobId, type, description, metadata, actorId: ctx.userId },
  });
}

function buildFollowupEmailBody(job: { jobNumber: string | null; draftNumber: string }, supplierName: string, lines: { partNumber: string; description: string | null; outstandingQty: string }[]) {
  const jobRef = job.jobNumber ?? job.draftNumber;
  const subject = `Follow-up — outstanding parts for Job ${jobRef}`;
  const body = lines.map((l) => `${l.partNumber} — ${l.description ?? "no description"} (outstanding qty ${l.outstandingQty})`).join("\n");
  const text = [
    `Hi ${supplierName},`,
    "",
    `Following up on the parts still outstanding for job ${jobRef}:`,
    "",
    body,
    "",
    "Please could you let us know an updated ETA for these?",
    "",
    "Thank you.",
  ].join("\n");
  return { subject, text };
}

// Groups every ordered-but-not-fully-received part line by the supplier it
// was ordered from, and sends one chase email per supplier. Lines with no
// orderedFromSupplierId (nothing ordered yet) are excluded — there's no
// one to chase. A supplier with no email on file, or when the company
// hasn't configured SMTP under Settings, is reported back as skipped
// rather than silently dropped, so the person knows to follow up by phone.
export async function sendPartsFollowup(ctx: RequestContext, jobId: string) {
  const companyId = requireJobsWrite(ctx);
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { id: true, jobNumber: true, draftNumber: true } });
  if (!job) notFound();

  const lines = await prisma.jobPartLine.findMany({
    where: { companyId, jobId, status: { in: ["ON_ORDER", "PARTIALLY_RECEIVED"] }, orderedFromSupplierId: { not: null } },
    include: { orderedFromSupplier: { select: { id: true, name: true, mainEmail: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (lines.length === 0) return { ok: true, sent: [], skipped: [], message: "No outstanding ordered parts on this job." };

  const bySupplier = new Map<string, { supplierId: string; supplierName: string; mainEmail: string | null; lines: { partNumber: string; description: string | null; outstandingQty: string }[] }>();
  for (const line of lines) {
    const supplier = line.orderedFromSupplier;
    if (!supplier) continue;
    const outstandingQty = new Prisma.Decimal(line.quantity).minus(line.receivedQuantity ? new Prisma.Decimal(line.receivedQuantity) : 0);
    if (!outstandingQty.greaterThan(0)) continue;
    const entry = bySupplier.get(supplier.id) ?? { supplierId: supplier.id, supplierName: supplier.name, mainEmail: supplier.mainEmail, lines: [] };
    entry.lines.push({ partNumber: line.partNumber, description: line.description, outstandingQty: outstandingQty.toString() });
    bySupplier.set(supplier.id, entry);
  }

  const emailConfigured = await isCompanyEmailConfigured(companyId);
  const sent: { supplierId: string; supplierName: string }[] = [];
  const skipped: { supplierId: string; supplierName: string; reason: string }[] = [];

  for (const entry of bySupplier.values()) {
    if (!emailConfigured) {
      skipped.push({ supplierId: entry.supplierId, supplierName: entry.supplierName, reason: "Email is not configured for this company yet — set it up under Settings." });
      continue;
    }
    if (!entry.mainEmail) {
      skipped.push({ supplierId: entry.supplierId, supplierName: entry.supplierName, reason: "This supplier has no email address on file." });
      continue;
    }
    const { subject, text } = buildFollowupEmailBody(job, entry.supplierName, entry.lines);
    try {
      await sendEmail(companyId, { to: entry.mainEmail, subject, text });
      sent.push({ supplierId: entry.supplierId, supplierName: entry.supplierName });
    } catch (err) {
      skipped.push({ supplierId: entry.supplierId, supplierName: entry.supplierName, reason: err instanceof Error ? err.message.slice(0, 300) : "Could not send the email." });
    }
  }

  if (sent.length > 0) {
    await prisma.$transaction(async (tx) => {
      await addActivity(tx, ctx, jobId, "PARTS_FOLLOWUP_SENT", `Follow-up sent to ${sent.length} supplier${sent.length === 1 ? "" : "s"}: ${sent.map((s) => s.supplierName).join(", ")}.`, { sent, skipped });
    });
  }

  await recordAudit(ctx, { source: "UI", module: "JOBS_WIP", entityType: "Job", entityId: jobId, action: "PARTS_FOLLOWUP", afterData: { jobId, sent, skipped } });
  return { ok: true, sent, skipped };
}
