import { prisma } from "@/lib/prisma";
import type { StorageBackend, S3CompatibleConfig } from "@/lib/storage/types";
import { createS3CompatibleBackend } from "@/lib/storage/s3-compatible-backend";
import { createLocalDiskBackend } from "@/lib/storage/local-disk-backend";

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
 * Resolves which storage backend a given company's file uploads/downloads
 * should use — see claude/decision-storage-architecture-render-plus-object-storage.md.
 * Resolution order:
 *   1. That company's own override on CompanySettings.storage* — the Super
 *      Admin "Storage location" setting on Platform > Companies > [company]
 *      (src/app/platform/companies/[id]/page.tsx). Not editable by the
 *      company's own Company Admin.
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
    },
  });
  if (settings?.storageProvider && settings.storageBucket && settings.storageAccessKeyId && settings.storageSecretAccessKey) {
    return createS3CompatibleBackend({
      provider: settings.storageProvider,
      bucket: settings.storageBucket,
      region: settings.storageRegion || "auto",
      endpoint: settings.storageEndpoint,
      accessKeyId: settings.storageAccessKeyId,
      secretAccessKey: settings.storageSecretAccessKey,
      forcePathStyle: true,
    });
  }

  const platformDefault = readPlatformDefaultConfig();
  if (platformDefault) return createS3CompatibleBackend({ ...platformDefault, forcePathStyle: true });

  if (process.env.NODE_ENV !== "production") return createLocalDiskBackend();
  throw new Error("STORAGE_NOT_CONFIGURED");
}
