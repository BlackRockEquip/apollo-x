import { randomUUID } from "node:crypto";
import type { AttachmentOwnerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStorageBackendForCompany } from "@/lib/storage";

// Low-level, auth-agnostic storage+DB-row primitives — see
// claude/decision-storage-architecture-render-plus-object-storage.md.
// Deliberately does NOT do any permission checking itself: every caller
// (company-settings-service.ts today; jobs/service.ts, rfq/service.ts,
// support-service.ts as each feature migrates — see the decision doc's
// "migration of existing inline blobs" open question) is expected to run
// its own requireTenantPermission/requireModule/requirePlatformPermission
// check first, exactly like it already does before touching any other
// tenant-scoped data. This mirrors how tenantWhere() in auth/guards.ts
// works — a helper the caller uses after authorizing, not instead of it.

export type NewAttachmentInput = {
  companyId: string;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
  notes?: string | null;
  uploadedById?: string | null;
  maxSizeBytes: number;
  allowedMimePattern: RegExp;
};

export type AttachmentRef = { companyId: string; objectKey: string; fileName: string };

function sanitizeFileName(fileName: string) {
  const cleaned = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.slice(-180) || "file";
}

/**
 * Uploads the given bytes to the resolved backend for `companyId`, then
 * records the Attachment row as COMMITTED. Not wrapped in a DB transaction
 * with any caller-side writes: the object-storage write is an external
 * side effect that can't participate in a Postgres transaction anyway (see
 * the decision doc's "Transactional integrity" open question) — a row
 * only gets created after the upload itself has already succeeded, so a
 * failed upload never leaves a dangling Attachment row. The inverse case
 * (upload succeeds, then this process dies before the row is created)
 * leaves an orphaned object with nothing pointing at it — acceptable for
 * now; a future sweep job is the documented follow-up, not built yet.
 */
export async function storeAttachment(input: NewAttachmentInput) {
  if (!input.allowedMimePattern.test(input.mimeType)) throw new Error("INVALID_ATTACHMENT_TYPE");
  const data = Buffer.from(input.contentBase64, "base64");
  if (data.length === 0) throw new Error("EMPTY_ATTACHMENT");
  if (data.length > input.maxSizeBytes) throw new Error("ATTACHMENT_TOO_LARGE");

  const backend = await getStorageBackendForCompany(input.companyId);
  const objectKey = `${input.companyId}/${input.ownerType.toLowerCase()}/${input.ownerId}/${randomUUID()}-${sanitizeFileName(input.fileName)}`;
  await backend.putObject(objectKey, data, input.mimeType);

  return prisma.attachment.create({
    data: {
      companyId: input.companyId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: data.length,
      provider: backend.providerName,
      objectKey,
      status: "COMMITTED",
      notes: input.notes ?? null,
      uploadedById: input.uploadedById ?? null,
    },
  });
}

/** Short-lived signed URL — never a public bucket URL. Call only after the caller's own permission check has passed. */
export async function getAttachmentDownloadUrl(attachment: AttachmentRef, expiresInSeconds?: number) {
  const backend = await getStorageBackendForCompany(attachment.companyId);
  return backend.getSignedDownloadUrl(attachment.objectKey, attachment.fileName, expiresInSeconds);
}

export async function deleteAttachment(attachment: { id: string; companyId: string; objectKey: string }) {
  const backend = await getStorageBackendForCompany(attachment.companyId);
  await backend.deleteObject(attachment.objectKey);
  await prisma.attachment.delete({ where: { id: attachment.id } });
}
