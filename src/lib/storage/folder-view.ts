import { prisma } from "@/lib/prisma";
import type { RequestContext } from "@/lib/auth/context-types";
import { AuthorizationError, requireModule, requireTenantPermission } from "@/lib/auth/guards";
import { jobFolderName, keyPrefix, tryGetBackend } from "@/lib/attachments/blob-store";
import {
  cleanFolderPath,
  filterByTopFolder,
  folderBreadcrumbs,
  foldLevel,
  isInsideFolder,
  keyToPath,
  mergeFolderFiles,
  rankFoldersByTerm,
  type FolderFile,
  type FolderLevelFile,
  type FolderLevelFolder,
} from "@/lib/storage/folder-level";

// "View folder" (2026-11-02, user request): lists what is in the company's storage location - one job's folder from the job page,
// or the whole storage from Settings > Files.
//
// A company user sees the files Apollo X filed there (the Attachment records: uploads, saved documents, RFQ quotes, support files).
// A Flo X platform administrator can also switch on "Everything on the server", which reads the real folder / bucket and so also
// shows files nobody filed through the system, and tells which filed files are no longer on the server.

export type FolderScope = { kind: "job"; jobId: string } | { kind: "company" };

export type FolderListing = {
  configured: boolean;
  provider: string | null;
  /** The folder being shown, from the storage root ("" = the root). */
  path: string;
  /** The folder the person cannot go above (a job's own folder, or the root). */
  rootPath: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  folders: FolderLevelFolder[];
  files: FolderLevelFile[];
  /** true when the real folder on the server was read (platform administrator, "Everything on the server" on). */
  everything: boolean;
  canSeeEverything: boolean;
  truncated: boolean;
  /** The job number typed in the search box (only the whole-storage screen at its top level can search); "" = not searching. */
  search: string;
};

const MAX_KNOWN_FILES = 20000;
const MAX_PHYSICAL_FILES = 5000;
const MAX_SEARCH_LENGTH = 40;

export function canSeeEverythingOnServer(ctx: RequestContext): boolean {
  return ctx.platformPermissions.has("PLATFORM_COMPANIES_EDIT");
}

async function authorize(ctx: RequestContext, scope: FolderScope): Promise<{ companyId: string; rootPath: string }> {
  if (!ctx.companyId) throw new AuthorizationError("An active company context is required.");
  const companyId = ctx.companyId;
  if (scope.kind === "company") {
    requireTenantPermission(ctx, "COMPANY_SETTINGS_VIEW");
    return { companyId, rootPath: "" };
  }
  requireModule(ctx, "JOBS_WIP", "READ");
  requireTenantPermission(ctx, "JOBS_VIEW");
  // The mechanic (USER) view and the WIP View user never see a job's Attachments, so they do not see its folder either.
  if (ctx.tenantRole === "USER" || ctx.tenantRole === "WIP_VIEWER") throw new AuthorizationError();
  const job = await prisma.job.findFirst({ where: { id: scope.jobId, companyId }, select: { id: true, jobNumber: true, draftNumber: true } });
  if (!job) throw new Error("NOT_FOUND");
  return { companyId, rootPath: jobFolderName(job, job.id) };
}

export async function listStorageFolder(ctx: RequestContext, scope: FolderScope, rawPath: string | null | undefined, wantEverything: boolean, rawSearch?: string | null): Promise<FolderListing> {
  const { companyId, rootPath } = await authorize(ctx, scope);
  const canSeeEverything = canSeeEverythingOnServer(ctx);
  const requested = cleanFolderPath(rawPath);
  const path = requested || rootPath;
  if (!isInsideFolder(path, rootPath)) throw new Error("NOT_FOUND");
  // Searching by job number looks through the top-level folders, so it only applies to the whole storage, from its top.
  const search = scope.kind === "company" && !path ? (rawSearch ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH) : "";
  const empty: FolderListing = { configured: false, provider: null, path, rootPath, breadcrumbs: folderBreadcrumbs(path), folders: [], files: [], everything: false, canSeeEverything, truncated: false, search };

  const backend = await tryGetBackend(companyId);
  if (!backend) return empty;
  const prefix = keyPrefix(backend, companyId);
  const keyStart = `${prefix}${path ? `${path}/` : ""}`;

  const rows = await prisma.attachment.findMany({
    // A search narrows the query itself (not only the result) so a company with a huge number of files still finds the job.
    where: { companyId, status: "COMMITTED", objectKey: search ? { startsWith: keyStart, contains: search.replace(/\s+/g, ""), mode: "insensitive" } : { startsWith: keyStart } },
    select: { objectKey: true, sizeBytes: true, createdAt: true, notes: true, uploadedBy: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_KNOWN_FILES,
  });
  const known: FolderFile[] = [];
  for (const row of rows) {
    const filePath = keyToPath(row.objectKey, prefix);
    if (!filePath) continue;
    known.push({ path: filePath, sizeBytes: row.sizeBytes, modifiedAt: row.createdAt.toISOString(), known: true, notes: row.notes, uploadedBy: row.uploadedBy?.displayName ?? null });
  }

  let everything = false;
  let truncated = rows.length >= MAX_KNOWN_FILES;
  let physical: Array<{ path: string; sizeBytes: number; modifiedAt: string | null }> | null = null;
  if (wantEverything && canSeeEverything && backend.listObjects) {
    const found = await backend.listObjects(`${prefix}${path}`, MAX_PHYSICAL_FILES);
    physical = [];
    for (const item of found) {
      const filePath = keyToPath(item.key, prefix);
      if (filePath) physical.push({ path: filePath, sizeBytes: item.sizeBytes, modifiedAt: item.modifiedAt ? item.modifiedAt.toISOString() : null });
    }
    everything = true;
    truncated = truncated || found.length >= MAX_PHYSICAL_FILES;
  }

  const merged = mergeFolderFiles(known, physical);
  const level = foldLevel(search ? filterByTopFolder(merged, search) : merged, path);
  const folders = search ? rankFoldersByTerm(level.folders, search) : level.folders;
  return { ...empty, configured: true, provider: backend.providerName, folders, files: level.files, everything, truncated };
}

/** A short-lived link that opens one file. Filed files for anyone allowed to see the folder; files not filed by the system only for a platform administrator. */
export async function getStorageFileUrl(ctx: RequestContext, scope: FolderScope, rawPath: string): Promise<{ url: string; fileName: string }> {
  const { companyId, rootPath } = await authorize(ctx, scope);
  const path = cleanFolderPath(rawPath);
  if (!path || !isInsideFolder(path, rootPath)) throw new Error("NOT_FOUND");
  const backend = await tryGetBackend(companyId);
  if (!backend) throw new Error("NOT_FOUND");
  const key = `${keyPrefix(backend, companyId)}${path}`;
  const filed = await prisma.attachment.findFirst({ where: { companyId, objectKey: key, status: "COMMITTED" }, select: { fileName: true, mimeType: true } });
  if (!filed && !canSeeEverythingOnServer(ctx)) throw new Error("NOT_FOUND");
  const fileName = filed?.fileName ?? path.slice(path.lastIndexOf("/") + 1);
  const inline = !!filed && (filed.mimeType === "application/pdf" || filed.mimeType.startsWith("image/"));
  return { url: await backend.getSignedDownloadUrl(key, fileName, 300, inline ? "inline" : "attachment"), fileName };
}
