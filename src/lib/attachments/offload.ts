import { prisma } from "@/lib/prisma";
import { jobFolderName, storeBlob, tryGetBackend } from "@/lib/attachments/blob-store";

// Moves files that were saved inline in the database (Bytes columns) into the
// company's chosen storage location, and empties the database copy once the
// stored copy has been read back successfully. Used right after every upload
// (best effort — if storage is not configured the file simply stays in the
// database) and by the Platform "Move files to this storage" button for
// everything uploaded before storage was configured.
//
// Every function returns the number of bytes moved, 0 when nothing was done.

const jobFolder = (job: { jobNumber: string | null; draftNumber: string | null; id: string }) => jobFolderName(job, job.id);

export async function offloadJobAttachment(id: string): Promise<number> {
  const row = await prisma.jobAttachment.findUnique({ where: { id }, include: { job: { select: { id: true, jobNumber: true, draftNumber: true } } } });
  if (!row || !row.data || row.storedAttachmentId) return 0;
  const stored = await storeBlob({ companyId: row.companyId, ownerType: "JOB", ownerId: row.jobId, folder: jobFolder(row.job), fileName: row.fileName, mimeType: row.mimeType, data: Buffer.from(row.data), uploadedById: row.createdById, notes: row.notes });
  if (!stored) return 0;
  await prisma.jobAttachment.update({ where: { id }, data: { storedAttachmentId: stored.id, data: null, fileName: stored.fileName } });
  return stored.sizeBytes;
}

export async function offloadRfqQuote(id: string): Promise<number> {
  const row = await prisma.jobRfqQuote.findUnique({ where: { id }, include: { rfqRequest: { select: { companyId: true, jobId: true, job: { select: { id: true, jobNumber: true, draftNumber: true } } } } } });
  if (!row || !row.data || !row.fileName || !row.mimeType || row.storedAttachmentId) return 0;
  const stored = await storeBlob({ companyId: row.rfqRequest.companyId, ownerType: "RFQ_QUOTE", ownerId: row.id, folder: jobFolder(row.rfqRequest.job), fileName: row.fileName, mimeType: row.mimeType, data: Buffer.from(row.data), uploadedById: row.createdById });
  if (!stored) return 0;
  await prisma.jobRfqQuote.update({ where: { id }, data: { storedAttachmentId: stored.id, data: null, fileName: stored.fileName } });
  return stored.sizeBytes;
}

export async function offloadRfqRequestAttachment(id: string): Promise<number> {
  const row = await prisma.jobRfqRequest.findUnique({ where: { id }, include: { job: { select: { id: true, jobNumber: true, draftNumber: true } } } });
  if (!row || !row.attachmentData || !row.attachmentFileName || !row.attachmentMimeType || row.storedAttachmentId) return 0;
  const stored = await storeBlob({ companyId: row.companyId, ownerType: "JOB", ownerId: row.jobId, folder: jobFolder(row.job), fileName: row.attachmentFileName, mimeType: row.attachmentMimeType, data: Buffer.from(row.attachmentData), uploadedById: row.createdById });
  if (!stored) return 0;
  await prisma.jobRfqRequest.update({ where: { id }, data: { storedAttachmentId: stored.id, attachmentData: null, attachmentFileName: stored.fileName } });
  return stored.sizeBytes;
}

export async function offloadGeneralRfqAttachment(id: string): Promise<number> {
  const row = await prisma.generalRfqRequest.findUnique({ where: { id } });
  if (!row || !row.attachmentData || !row.attachmentFileName || !row.attachmentMimeType || row.storedAttachmentId) return 0;
  const stored = await storeBlob({ companyId: row.companyId, ownerType: "GENERAL_RFQ", ownerId: row.id, folder: "RFQs", fileName: row.attachmentFileName, mimeType: row.attachmentMimeType, data: Buffer.from(row.attachmentData), uploadedById: row.createdById });
  if (!stored) return 0;
  await prisma.generalRfqRequest.update({ where: { id }, data: { storedAttachmentId: stored.id, attachmentData: null, attachmentFileName: stored.fileName } });
  return stored.sizeBytes;
}

export async function offloadSupportAttachment(id: string): Promise<number> {
  const row = await prisma.supportTicketAttachment.findUnique({ where: { id }, include: { ticket: { select: { ticketNumber: true } } } });
  if (!row || !row.data || row.storedAttachmentId) return 0;
  const stored = await storeBlob({ companyId: row.companyId, ownerType: "SUPPORT_TICKET", ownerId: row.ticketId, folder: `Support/${row.ticket.ticketNumber}`, fileName: row.fileName, mimeType: row.mimeType, data: Buffer.from(row.data), uploadedById: row.uploadedById });
  if (!stored) return 0;
  await prisma.supportTicketAttachment.update({ where: { id }, data: { storedAttachmentId: stored.id, data: null, fileName: stored.fileName } });
  return stored.sizeBytes;
}

/** After a support ticket/reply is saved: move every inline file on the ticket. Best effort. */
export async function offloadSupportTicketAttachments(ticketId: string) {
  try {
    const rows = await prisma.supportTicketAttachment.findMany({ where: { ticketId, storedAttachmentId: null }, select: { id: true } });
    for (const row of rows) await offloadSupportAttachment(row.id);
  } catch {
    // stays in the database; the Platform "Move files" tool picks it up later
  }
}

/** Best-effort wrapper for upload paths: storage trouble must never fail the upload itself. */
export async function offloadQuietly(task: Promise<unknown>) {
  try {
    await task;
  } catch (error) {
    console.error("[storage] could not move file to storage location:", error instanceof Error ? error.message : error);
  }
}

// ---------------------------------------------------------------------------
// Bulk: Platform > Companies > [company] > "Move files to this storage"
// ---------------------------------------------------------------------------

export type InlineFileCounts = { jobAttachments: number; rfqFiles: number; supportFiles: number; total: number };

export async function countInlineFiles(companyId: string): Promise<InlineFileCounts> {
  const [jobAttachments, quotes, requests, general, supportFiles] = await Promise.all([
    prisma.jobAttachment.count({ where: { companyId, storedAttachmentId: null, data: { not: null } } }),
    prisma.jobRfqQuote.count({ where: { rfqRequest: { companyId }, storedAttachmentId: null, data: { not: null } } }),
    prisma.jobRfqRequest.count({ where: { companyId, storedAttachmentId: null, attachmentData: { not: null } } }),
    prisma.generalRfqRequest.count({ where: { companyId, storedAttachmentId: null, attachmentData: { not: null } } }),
    prisma.supportTicketAttachment.count({ where: { companyId, storedAttachmentId: null, data: { not: null } } }),
  ]);
  const rfqFiles = quotes + requests + general;
  return { jobAttachments, rfqFiles, supportFiles, total: jobAttachments + rfqFiles + supportFiles };
}

export type MoveBatchResult = { moved: number; failed: { what: string; reason: string }[]; remaining: number };

/**
 * Moves one batch (a handful of files, bounded by count and bytes so a single
 * request stays short). The caller repeats until `remaining` is 0 or every
 * remaining file has failed.
 */
export async function moveInlineFilesBatch(companyId: string, limits = { maxFiles: 15, maxBytes: 24 * 1024 * 1024 }): Promise<MoveBatchResult> {
  const backend = await tryGetBackend(companyId);
  if (!backend) throw new Error("STORAGE_NOT_CONFIGURED");
  let moved = 0;
  let bytes = 0;
  const failed: MoveBatchResult["failed"] = [];
  const room = () => moved + failed.length < limits.maxFiles && bytes < limits.maxBytes;

  const attempt = async (what: string, run: () => Promise<number>) => {
    try {
      const size = await run();
      if (size > 0) { moved++; bytes += size; }
    } catch (error) {
      failed.push({ what, reason: error instanceof Error ? error.message : "unknown error" });
    }
  };

  for (const row of await prisma.jobAttachment.findMany({ where: { companyId, storedAttachmentId: null, data: { not: null } }, select: { id: true, fileName: true }, take: limits.maxFiles })) {
    if (!room()) break;
    await attempt(`Job file ${row.fileName}`, () => offloadJobAttachment(row.id));
  }
  for (const row of await prisma.jobRfqQuote.findMany({ where: { rfqRequest: { companyId }, storedAttachmentId: null, data: { not: null } }, select: { id: true, fileName: true }, take: limits.maxFiles })) {
    if (!room()) break;
    await attempt(`RFQ quote ${row.fileName ?? ""}`, () => offloadRfqQuote(row.id));
  }
  for (const row of await prisma.jobRfqRequest.findMany({ where: { companyId, storedAttachmentId: null, attachmentData: { not: null } }, select: { id: true, attachmentFileName: true }, take: limits.maxFiles })) {
    if (!room()) break;
    await attempt(`RFQ attachment ${row.attachmentFileName ?? ""}`, () => offloadRfqRequestAttachment(row.id));
  }
  for (const row of await prisma.generalRfqRequest.findMany({ where: { companyId, storedAttachmentId: null, attachmentData: { not: null } }, select: { id: true, attachmentFileName: true }, take: limits.maxFiles })) {
    if (!room()) break;
    await attempt(`RFQ attachment ${row.attachmentFileName ?? ""}`, () => offloadGeneralRfqAttachment(row.id));
  }
  for (const row of await prisma.supportTicketAttachment.findMany({ where: { companyId, storedAttachmentId: null, data: { not: null } }, select: { id: true, fileName: true }, take: limits.maxFiles })) {
    if (!room()) break;
    await attempt(`Support file ${row.fileName}`, () => offloadSupportAttachment(row.id));
  }
  const counts = await countInlineFiles(companyId);
  return { moved, failed, remaining: counts.total };
}
