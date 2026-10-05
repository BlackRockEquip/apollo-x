import type { AttachmentOwnerType, Attachment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorageBackendForCompany } from "@/lib/storage";
import type { StorageBackend } from "@/lib/storage/types";

// Files that belong to a job, an RFQ or a support ticket are written into the
// company's chosen storage location (Platform > Companies > [company] >
// Storage location) in the layout the business asked for:
//
//   <storage root>/<JOB NUMBER>/<file name>      job files, RFQ files, saved documents
//   <storage root>/RFQs/<file name>               RFQs that are not linked to a job
//   <storage root>/Support/<TICKET NUMBER>/<file> support ticket files
//
// File names are whatever the user called the file; saved documents are named
// "<JOB NUMBER> - <Document title>.pdf". Buckets shared between companies
// (everything except a per-company LOCAL_FOLDER) get a "<companyId>/" key
// prefix so two companies' "BRE1122" folders can never collide.

/** Replaces characters Windows/Linux/S3 cannot take in a folder or file name; keeps spaces, dashes, brackets. */
export function sanitizeSegment(value: string, fallback = "file") {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 160);
  return cleaned || fallback;
}

export async function tryGetBackend(companyId: string): Promise<StorageBackend | null> {
  try {
    return await getStorageBackendForCompany(companyId);
  } catch (error) {
    if (error instanceof Error && error.message === "STORAGE_NOT_CONFIGURED") return null;
    throw error;
  }
}

function keyPrefix(backend: StorageBackend, companyId: string) {
  return backend.providerName === "LOCAL_FOLDER" ? "" : `${companyId}/`;
}

function splitName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 && dot > fileName.length - 12 ? { base: fileName.slice(0, dot), ext: fileName.slice(dot) } : { base: fileName, ext: "" };
}

/** First free "<folder>/<name>", adding " (2)", " (3)" … before the extension when the name is already used in that folder. */
async function freeObjectKey(backend: StorageBackend, companyId: string, folder: string, fileName: string) {
  const prefix = keyPrefix(backend, companyId);
  const { base, ext } = splitName(fileName);
  for (let n = 1; n < 500; n++) {
    const name = n === 1 ? fileName : `${base} (${n})${ext}`;
    const key = `${prefix}${folder}/${name}`;
    const taken = await prisma.attachment.findFirst({ where: { companyId, objectKey: key }, select: { id: true } });
    if (!taken) return { key, name };
  }
  throw new Error("ATTACHMENT_NAME_EXHAUSTED");
}

export type StoreBlobInput = {
  companyId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  /** Folder under the storage root, e.g. a job number, "RFQs" or "Support/TCK-0001". */
  folder: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
  uploadedById?: string | null;
  notes?: string | null;
};

/**
 * Writes the bytes into the company's storage (verifying by reading them back)
 * and records an Attachment row. Returns null when no storage is configured
 * for this company — the caller then keeps the bytes in the database as before.
 */
export async function storeBlob(input: StoreBlobInput): Promise<Attachment | null> {
  const backend = await tryGetBackend(input.companyId);
  if (!backend) return null;
  const folder = input.folder.split("/").map((segment) => sanitizeSegment(segment, "Folder")).join("/");
  const { key, name } = await freeObjectKey(backend, input.companyId, folder, sanitizeSegment(input.fileName));
  await backend.putObject(key, input.data, input.mimeType);
  const back = await backend.getObject(key);
  if (!back.equals(input.data)) throw new Error("STORAGE_VERIFY_FAILED");
  return prisma.attachment.create({
    data: {
      companyId: input.companyId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      fileName: name,
      mimeType: input.mimeType,
      sizeBytes: input.data.length,
      provider: backend.providerName,
      objectKey: key,
      status: "COMMITTED",
      notes: input.notes ?? null,
      uploadedById: input.uploadedById ?? null,
    },
  });
}

/** Reads a stored file through the company's CURRENT storage. */
export async function readStoredBlob(companyId: string, storedAttachmentId: string) {
  const attachment = await prisma.attachment.findFirst({ where: { id: storedAttachmentId, companyId } });
  if (!attachment) throw new Error("STORAGE_FILE_MISSING");
  const backend = await getStorageBackendForCompany(companyId);
  try {
    return { data: await backend.getObject(attachment.objectKey), fileName: attachment.fileName, mimeType: attachment.mimeType };
  } catch {
    // Not in the current location: usually the storage was switched and the exported files have not been imported yet.
    throw new Error("STORAGE_FILE_MISSING");
  }
}

/** Removes a stored file and its Attachment row. Never throws: a file that is already gone is fine. */
export async function deleteStoredBlob(companyId: string, storedAttachmentId: string | null | undefined) {
  if (!storedAttachmentId) return;
  const attachment = await prisma.attachment.findFirst({ where: { id: storedAttachmentId, companyId } });
  if (!attachment) return;
  try {
    const backend = await getStorageBackendForCompany(companyId);
    await backend.deleteObject(attachment.objectKey);
  } catch {
    // keep going: the row must still go so the file list stays correct
  }
  await prisma.attachment.delete({ where: { id: attachment.id } }).catch(() => undefined);
}

/** Creates the job's folder in the company's storage (real folders only; buckets need nothing). Best effort. */
export async function ensureJobFolder(companyId: string, jobNumber: string | null | undefined) {
  if (!jobNumber) return;
  try {
    const backend = await tryGetBackend(companyId);
    if (!backend?.ensureFolder) return;
    await backend.ensureFolder(`${keyPrefix(backend, companyId)}${sanitizeSegment(jobNumber, "Job")}`);
  } catch {
    // The folder is created again on the first file written; never block job creation on storage.
  }
}

/** The folder name used for a job's files. */
export function jobFolderName(job: { jobNumber: string | null; draftNumber: string | null }, fallback: string) {
  return sanitizeSegment(job.jobNumber ?? job.draftNumber ?? fallback, "Job");
}
