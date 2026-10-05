import { prisma } from "@/lib/prisma";
import type { StorageBackend, S3CompatibleConfig, StorageProfile } from "@/lib/storage/types";
import { createS3CompatibleBackend } from "@/lib/storage/s3-compatible-backend";
import { createLocalDiskBackend } from "@/lib/storage/local-disk-backend";
import { createLocalFolderBackend } from "@/lib/storage/local-folder-backend";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/storage/secret-crypto";

function readPlatformDefaultConfig(): S3CompatibleConfig | null {
  const provider = process.env.STORAGE_PROVIDER_DEFAULT as S3CompatibleConfig["provider"] | undefined;
  const bucket = process.env.STORAGE_S3_BUCKET;
  const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
  if (!provider || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    provider,
    bucket,
    region: process.env.STORAGE_S3_REGION || "auto",
    endpoint: process.env.STORAGE_S3_ENDPOINT || undefined,
    accessKeyId,
    secretAccessKey,
  };
}

/**
 * Builds a backend from an explicit storage profile — used both by the
 * per-company resolution below and by the Platform "Test connection" button
 * (which has to test values that have not been saved yet). Returns null when
 * the profile is incomplete.
 */
export function getStorageBackendFromProfile(companyId: string, profile: StorageProfile): StorageBackend | null {
  if (profile.provider === "LOCAL_FOLDER") {
    if (!profile.localPath?.trim()) return null;
    return createLocalFolderBackend({ companyId, rootPath: profile.localPath });
  }
  if (!profile.bucket || !profile.accessKeyId || !profile.secretAccessKey) return null;
  return createS3CompatibleBackend({
    provider: profile.provider,
    bucket: profile.bucket,
    region: profile.region || "auto",
    endpoint: profile.endpoint,
    accessKeyId: profile.accessKeyId,
    secretAccessKey: profile.secretAccessKey,
    forcePathStyle: true,
  });
}

/**
 * Resolves which storage backend a given company's file uploads/downloads
 * should use — see claude/decision-storage-architecture-render-plus-object-storage.md.
 * Resolution order:
 *   1. That company's own override on CompanySettings.storage* — the Super
 *      Admin "Storage location" setting on Platform > Companies > [company]
 *      (src/app/platform/companies/[id]/page.tsx): Cloudflare R2, another
 *      S3-compatible bucket, or (2026-10-05) a local folder on the server.
 *      Not editable by the company's own Company Admin.
 *   2. The platform-wide default bucket, configured via STORAGE_* env vars.
 *   3. In non-production only, a local-disk fallback (so `next dev` needs
 *      no real bucket at all). Production with neither (1) nor (2)
 *      configured throws rather than silently falling back to local disk,
 *      which would be a worse failure mode than a clear startup error.
 */
export async function getStorageBackendForCompany(companyId: string): Promise<StorageBackend> {
  const settings = await prisma.companySettings.findUnique({
    where: { companyId },
    select: {
      storageProvider: true,
      storageBucket: true,
      storageRegion: true,
      storageEndpoint: true,
      storageAccessKeyId: true,
      storageSecretAccessKey: true,
      storageLocalPath: true,
    },
  });
  if (settings?.storageProvider) {
    // The secret is encrypted at rest (see secret-crypto.ts). A legacy
    // plaintext value is upgraded in place the first time it is read.
    const secret = decryptSecret(settings.storageSecretAccessKey);
    if (settings.storageProvider !== "LOCAL_FOLDER" && settings.storageSecretAccessKey && secret === null) throw new Error("STORAGE_SECRET_UNREADABLE");
    if (secret && !isEncryptedSecret(settings.storageSecretAccessKey)) {
      await prisma.companySettings.update({ where: { companyId }, data: { storageSecretAccessKey: encryptSecret(secret) } }).catch(() => undefined);
    }
    const own = getStorageBackendFromProfile(companyId, {
      provider: settings.storageProvider,
      bucket: settings.storageBucket,
      region: settings.storageRegion,
      endpoint: settings.storageEndpoint,
      accessKeyId: settings.storageAccessKeyId,
      secretAccessKey: secret,
      localPath: settings.storageLocalPath,
    });
    if (own) return own;
  }

  const platformDefault = readPlatformDefaultConfig();
  if (platformDefault) return createS3CompatibleBackend({ ...platformDefault, forcePathStyle: true });

  if (process.env.NODE_ENV !== "production") return createLocalDiskBackend();
  throw new Error("STORAGE_NOT_CONFIGURED");
}
