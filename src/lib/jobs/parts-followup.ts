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

// Synthetic bucket id for part lines with no orderedFromSupplierId at all —
// 2026-09-15 user request: "add suppliers to list even though order number
// not filled in, if no supplier is added put under 'Unknown' supplier
// name." Never collides with a real Prisma cuid.
const UNKNOWN_SUPPLIER_ID = "unknown";

// Groups every not-yet-fully-received part line by the supplier it was
// ordered from, and sends one chase email per supplier. Originally this
// only picked up ON_ORDER/PARTIALLY_RECEIVED lines that already had a
// supplier assigned — but a line only reaches ON_ORDER once BOTH a
// supplier AND an order number are saved (see updatePartLineOrder in
// service.ts: `status: orderNumber && line.status === "PENDING" ?
// "ON_ORDER" : line.status`), so a part with a supplier picked but no PO
// number typed in yet stayed PENDING and silently never showed up here —
// exactly the gap the user flagged. Now: every not-yet-received,
// not-already-in-stock line is considered (PENDING/ON_ORDER/
// PARTIALLY_RECEIVED — IN_STOCK is excluded, nothing to chase for a part
// already on the shelf), and a line with no supplier assigned at all is
// grouped under a synthetic "Unknown" bucket instead of being dropped, so
// it's visible (in the skipped list, with a reason) rather than invisible.
// A supplier with no email on file, or when the company hasn't configured
// SMTP under Settings, is likewise reported back as skipped rather than
// silently dropped, so the person knows to follow up by phone.
//
// 2026-09-16 — user request: "Parts Follow up still does not show suppliers
// that have outstanding parts, like ModApp." This action always sent blind
// to every outstanding supplier at once with nothing shown beforehand — see
// JobWorkspace.tsx's Parts follow-up section, which now computes and
// displays the same per-supplier breakdown client-side from job.partLines
// (ModApp's PartsFollowUpButton.tsx does this with a card per supplier).
// To let a person chase just one supplier from that breakdown instead of
// emailing everyone, `onlySupplierId` narrows this to a single supplier's
// group; omitted (or the "unknown" bucket, which never has an email to
// send to) keeps the original send-to-everyone behavior.
export async function sendPartsFollowup(ctx: RequestContext, jobId: string, onlySupplierId?: string) {
  const companyId = requireJobsWrite(ctx);
  const job = await prisma.job.findFirst({ where: { id: jobId, companyId }, select: { id: true, jobNumber: true, draftNumber: true } });
  if (!job) notFound();

  const lines = await prisma.jobPartLine.findMany({
    where: { companyId, jobId, status: { in: ["PENDING", "ON_ORDER", "PARTIALLY_RECEIVED"] } },
    include: { orderedFromSupplier: { select: { id: true, name: true, mainEmail: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (lines.length === 0) return { ok: true, sent: [], skipped: [], message: "No outstanding ordered parts on this job." };

  const bySupplier = new Map<string, { supplierId: string; supplierName: string; mainEmail: string | null; lines: { partNumber: string; description: string | null; outstandingQty: string }[] }>();
  for (const line of lines) {
    const supplier = line.orderedFromSupplier;
    const outstandingQty = new Prisma.Decimal(line.quantity).minus(line.receivedQuantity ? new Prisma.Decimal(line.receivedQuantity) : 0);
    if (!outstandingQty.greaterThan(0)) continue;
    const supplierId = supplier?.id ?? UNKNOWN_SUPPLIER_ID;
    const supplierName = supplier?.name ?? "Unknown";
    const entry = bySupplier.get(supplierId) ?? { supplierId, supplierName, mainEmail: supplier?.mainEmail ?? null, lines: [] };
    entry.lines.push({ partNumber: line.partNumber, description: line.description, outstandingQty: outstandingQty.toString() });
    bySupplier.set(supplierId, entry);
  }

  const emailConfigured = await isCompanyEmailConfigured(companyId);
  const sent: { supplierId: string; supplierName: string }[] = [];
  const skipped: { supplierId: string; supplierName: string; reason: string }[] = [];

  const entries = onlySupplierId ? Array.from(bySupplier.values()).filter((e) => e.supplierId === onlySupplierId) : Array.from(bySupplier.values());
  for (const entry of entries) {
    if (entry.supplierId === UNKNOWN_SUPPLIER_ID) {
      skipped.push({ supplierId: entry.supplierId, supplierName: entry.supplierName, reason: "No supplier assigned to these parts yet — assign a supplier on the parts list, or follow up manually." });
      continue;
    }
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
