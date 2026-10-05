import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { requirePlatformPermission } from "@/lib/auth/guards";
import { getStorageBackendForCompany, getStorageBackendFromProfile } from "@/lib/storage";
import { buildStorageProfile, type StorageProfileInput } from "@/lib/storage/profile";
import { buildZip, readZip } from "@/lib/storage/zip";
import { countInlineFiles, moveInlineFilesBatch, type InlineFileCounts, type MoveBatchResult } from "@/lib/attachments/offload";

// Platform Admin > Companies > [company] > Storage location helpers: the file
// count behind the "you already have files" warning, the Test connection
// button, and the "Export current files" zip. All Super Admin only (same
// permission as saving the storage profile).

function requirePlatformStorageAccess(ctx: RequestContext) {
  requirePlatformPermission(ctx, "PLATFORM_CONFIGURATION_MANAGE");
  if (ctx.companyId) throw new Error("PLATFORM_CONTEXT_REQUIRED");
}

export async function countCompanyStoredFiles(companyId: string) {
  const result = await prisma.attachment.aggregate({ where: { companyId, status: "COMMITTED" }, _count: { _all: true }, _sum: { sizeBytes: true } });
  return { fileCount: result._count._all, totalBytes: result._sum.sizeBytes ?? 0 };
}

export async function getPlatformCompanyStorageSummary(ctx: RequestContext, companyId: string) {
  requirePlatformStorageAccess(ctx);
  return countCompanyStoredFiles(companyId);
}

export type StorageTestStep = { step: string; ok: boolean; detail?: string };
export type StorageTestResult = { ok: boolean; steps: StorageTestStep[]; message: string };

function friendlyStorageError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "";
  const code = (error as { code?: string } | null)?.code ?? "";
  const hint = (() => {
    if (name === "InvalidAccessKeyId" || /InvalidAccessKeyId/.test(raw)) return "The access key ID is not recognised — check it was copied in full.";
    if (name === "SignatureDoesNotMatch" || /SignatureDoesNotMatch/.test(raw)) return "The secret access key does not match the access key ID.";
    if (name === "NoSuchBucket" || /NoSuchBucket/.test(raw)) return "That bucket does not exist for this account — check the bucket name (and Account ID for R2).";
    if (name === "AccessDenied" || /AccessDenied|Forbidden/.test(raw)) return "The key was accepted but is not allowed to read/write this bucket — create the API token with Object Read & Write permission for this bucket.";
    if (code === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/.test(raw)) return "The endpoint address could not be found — check the Account ID / endpoint for typos.";
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || /ECONNREFUSED|ETIMEDOUT/.test(raw)) return "Could not reach the storage service — check the endpoint and that the server has internet access.";
    if (code === "ENOENT") return "The folder (or its drive/share) does not exist on the server.";
    if (code === "EACCES" || code === "EPERM") return "The Apollo X server account is not allowed to write to that folder.";
    if (code === "ENOSPC") return "The disk is full.";
    return "";
  })();
  return hint ? `${hint} (${name || code || raw})` : raw;
}

/**
 * Real write → read back → delete against the values currently typed into the
 * form (not necessarily saved yet). A blank secret falls back to the stored
 * one, same as saving does.
 */
export async function testPlatformCompanyStorage(ctx: RequestContext, companyId: string, input: StorageProfileInput): Promise<StorageTestResult> {
  requirePlatformStorageAccess(ctx);
  const settings = await prisma.companySettings.findUnique({ where: { companyId } });
  if (!settings) throw new Error("RESOURCE_NOT_FOUND");
  const profile = buildStorageProfile(input, settings);
  if (!profile) return { ok: false, steps: [], message: "Nothing to test — this company is on the platform default." };
  const backend = getStorageBackendFromProfile(companyId, profile);
  if (!backend) return { ok: false, steps: [], message: "The settings are incomplete." };

  const key = `${companyId}/_connection-test/${randomUUID()}.txt`;
  const payload = Buffer.from(`Apollo X storage test ${new Date().toISOString()}`);
  const steps: StorageTestStep[] = [];
  const fail = (step: string, error: unknown): StorageTestResult => {
    const detail = friendlyStorageError(error);
    steps.push({ step, ok: false, detail });
    return { ok: false, steps, message: `Test failed while trying to ${step.toLowerCase()}: ${detail}` };
  };
  try {
    await backend.putObject(key, payload, "text/plain");
    steps.push({ step: "Write a test file", ok: true });
  } catch (error) {
    return fail("Write a test file", error);
  }
  try {
    const back = await backend.getObject(key);
    if (!back.equals(payload)) throw new Error("The file read back was different from the file written.");
    steps.push({ step: "Read it back", ok: true });
  } catch (error) {
    await backend.deleteObject(key).catch(() => undefined);
    return fail("Read it back", error);
  }
  try {
    await backend.deleteObject(key);
    steps.push({ step: "Delete the test file", ok: true });
  } catch (error) {
    return fail("Delete the test file", error);
  }
  return { ok: true, steps, message: "Connection works: a test file was written, read back and deleted." };
}

const EXPORT_LIMIT_BYTES = 200 * 1024 * 1024;

/** Every stored file for the company (read via its CURRENT storage) plus a manifest.csv, as one .zip. */
export async function exportPlatformCompanyFiles(ctx: RequestContext, companyId: string) {
  requirePlatformStorageAccess(ctx);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { internalCode: true } });
  if (!company) throw new Error("RESOURCE_NOT_FOUND");
  const { totalBytes } = await countCompanyStoredFiles(companyId);
  if (totalBytes > EXPORT_LIMIT_BYTES) throw new Error("STORAGE_EXPORT_TOO_LARGE");
  const attachments = await prisma.attachment.findMany({ where: { companyId, status: "COMMITTED" }, orderBy: { createdAt: "asc" } });
  const backend = await getStorageBackendForCompany(companyId);
  const entries: { name: string; data: Buffer }[] = [];
  const manifest: string[] = ["file (path in storage),attachment id,file name,owner type,owner id,uploaded,size bytes,stored in,status"];
  const csv = (value: string) => `"${value.replace(/"/g, '""')}"`;
  for (const attachment of attachments) {
    // Entries are named by their path in the storage location (e.g.
    // "BRE1122/BRE1152 - Job History.pdf"), so the Import tool can put each file
    // back exactly where Apollo X looks for it — and unzipping the export gives
    // the same folder layout as the storage itself.
    let status = "exported";
    try {
      entries.push({ name: attachment.objectKey, data: await backend.getObject(attachment.objectKey) });
    } catch {
      status = "NOT READABLE from the current storage";
    }
    manifest.push([csv(attachment.objectKey), csv(attachment.id), csv(attachment.fileName), csv(attachment.ownerType), csv(attachment.ownerId), csv(attachment.createdAt.toISOString()), String(attachment.sizeBytes), csv(attachment.provider), csv(status)].join(","));
  }
  entries.push({ name: "manifest.csv", data: Buffer.from(manifest.join("\r\n") + "\r\n", "utf8") });
  return { fileName: `${company.internalCode}-files-${new Date().toISOString().slice(0, 10)}.zip`, data: buildZip(entries) };
}

// ---------------------------------------------------------------------------
// Files still in the database, and moving them to the chosen storage
// ---------------------------------------------------------------------------

export async function getPlatformCompanyInlineFiles(ctx: RequestContext, companyId: string): Promise<InlineFileCounts> {
  requirePlatformStorageAccess(ctx);
  return countInlineFiles(companyId);
}

/** One batch of "move files from the database to this company's storage". The caller repeats until remaining is 0. */
export async function movePlatformCompanyFilesBatch(ctx: RequestContext, companyId: string): Promise<MoveBatchResult> {
  requirePlatformStorageAccess(ctx);
  const exists = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!exists) throw new Error("RESOURCE_NOT_FOUND");
  return moveInlineFilesBatch(companyId);
}

// ---------------------------------------------------------------------------
// Import: put an exported .zip (or a copied folder, zipped) back into the
// current storage so the files open again after the storage was changed.
// ---------------------------------------------------------------------------

export type StorageImportResult = { imported: number; alreadyPresent: number; unmatched: string[]; stillMissing: number };

export async function importPlatformCompanyFiles(ctx: RequestContext, companyId: string, zip: Buffer): Promise<StorageImportResult> {
  requirePlatformStorageAccess(ctx);
  const attachments = await prisma.attachment.findMany({ where: { companyId, status: "COMMITTED" } });
  const backend = await getStorageBackendForCompany(companyId);
  let entries;
  try {
    entries = readZip(zip);
  } catch {
    throw new Error("STORAGE_IMPORT_BAD_ZIP");
  }
  const byKey = new Map(attachments.map((a) => [a.objectKey, a]));
  const claimed = new Set<string>();
  const unmatched: string[] = [];
  let imported = 0;
  let alreadyPresent = 0;

  const norm = (name: string) => name.replace(/\\/g, "/").replace(/^\.?\//, "");
  const findAttachment = (entryPath: string, size: number) => {
    const path = norm(entryPath);
    const exact = byKey.get(path);
    if (exact && !claimed.has(exact.id)) return exact;
    // Re-zipped inside a wrapper folder: "Export/BRE1122/file.pdf" still matches "BRE1122/file.pdf".
    const suffix = attachments.find((a) => !claimed.has(a.id) && path.endsWith("/" + a.objectKey));
    if (suffix) return suffix;
    // Files moved around by hand: same file name and size, when that is unambiguous.
    const base = path.split("/").pop() ?? path;
    const sameFile = attachments.filter((a) => !claimed.has(a.id) && a.fileName === base && a.sizeBytes === size);
    return sameFile.length === 1 ? sameFile[0] : undefined;
  };

  for (const entry of entries) {
    if (norm(entry.name).toLowerCase() === "manifest.csv" || entry.name.toLowerCase().endsWith("/manifest.csv")) continue;
    const attachment = findAttachment(entry.name, entry.data.length);
    if (!attachment) { unmatched.push(entry.name); continue; }
    claimed.add(attachment.id);
    const present = await backend.getObject(attachment.objectKey).then((existing) => existing.equals(entry.data)).catch(() => false);
    if (present) { alreadyPresent++; continue; }
    await backend.putObject(attachment.objectKey, entry.data, attachment.mimeType);
    const back = await backend.getObject(attachment.objectKey);
    if (!back.equals(entry.data)) throw new Error("STORAGE_VERIFY_FAILED");
    await prisma.attachment.update({ where: { id: attachment.id }, data: { provider: backend.providerName } });
    imported++;
  }
  let stillMissing = 0;
  for (const attachment of attachments) {
    if (claimed.has(attachment.id)) continue;
    const ok = await backend.getObject(attachment.objectKey).then(() => true).catch(() => false);
    if (!ok) stillMissing++;
  }
  return { imported, alreadyPresent, unmatched: unmatched.slice(0, 50), stillMissing };
}
