import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, sep } from "node:path";
import type { LocalFolderConfig, StorageBackend } from "@/lib/storage/types";
import { signStorageLink } from "@/lib/storage/signing";

// "Local folder" storage option — files are written under an admin-chosen
// folder on the server Apollo X runs on (local disk, mounted network share,
// Render persistent disk). Platform Admin > Companies > [company] > Storage
// location. Unlike local-disk-backend.ts (dev-only fallback under
// .local-storage/), this one is a real production option.
//
// Object keys already start with "<companyId>/..." (see
// src/lib/attachments/service.ts), so even when two companies point at the
// same folder their files never mix. Every path is re-checked to stay inside
// the root, so a crafted key cannot escape the folder.

export function isUsableLocalFolderPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (trimmed.split(/[\\/]/).some((segment) => segment === "..")) return false;
  // Absolute POSIX path, Windows drive path, or UNC share.
  return isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\");
}

export function resolveLocalFolderObjectPath(rootPath: string, objectKey: string) {
  const root = normalize(rootPath.trim());
  const safeSegments = objectKey.split("/").filter((segment) => segment && segment !== "." && segment !== "..");
  if (safeSegments.length === 0) throw new Error("INVALID_OBJECT_KEY");
  const full = normalize(join(root, ...safeSegments));
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (!full.startsWith(prefix)) throw new Error("INVALID_OBJECT_KEY");
  return full;
}

export function createLocalFolderBackend(config: LocalFolderConfig): StorageBackend {
  if (!isUsableLocalFolderPath(config.rootPath)) throw new Error("STORAGE_LOCAL_PATH_INVALID");
  return {
    providerName: "LOCAL_FOLDER",
    async putObject(objectKey, body) {
      const path = resolveLocalFolderObjectPath(config.rootPath, objectKey);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async getSignedDownloadUrl(objectKey, fileName, expiresInSeconds = 300, disposition = "attachment") {
      const token = signStorageLink({ c: config.companyId, k: objectKey, f: fileName, d: disposition, e: Math.floor(Date.now() / 1000) + expiresInSeconds });
      return `/api/v1/storage-files/${token}`;
    },
    async deleteObject(objectKey) {
      await rm(resolveLocalFolderObjectPath(config.rootPath, objectKey), { force: true });
    },
    async getObject(objectKey) {
      return readFile(resolveLocalFolderObjectPath(config.rootPath, objectKey));
    },
    async ensureFolder(folder) {
      await mkdir(resolveLocalFolderObjectPath(config.rootPath, folder), { recursive: true });
    },
  };
}
