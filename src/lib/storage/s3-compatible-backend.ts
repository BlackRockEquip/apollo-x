import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3CompatibleConfig, StorageBackend } from "@/lib/storage/types";

// Cloudflare R2 and Backblaze B2 both speak the S3 API, so one client
// covers R2 / B2 / any other S3-compatible service (including a
// self-hosted MinIO, if a company ever needs on-prem storage — see the
// "local storage" discussion in the storage decision doc) — only
// endpoint/region/credentials differ per company. R2 has no native
// "region" concept; its own docs say to pass "auto". forcePathStyle
// defaults on because B2 (and MinIO) need it; R2 tolerates it fine, so
// this one code path works for all three without a provider branch.
export function createS3CompatibleBackend(config: S3CompatibleConfig): StorageBackend {
  const client = new S3Client({
    region: config.region || "auto",
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle ?? true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  return {
    providerName: config.provider,
    async putObject(objectKey, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: objectKey, Body: body, ContentType: contentType }));
    },
    async getSignedDownloadUrl(objectKey, fileName, expiresInSeconds = 300) {
      // Buckets are never public (see the decision doc's "Access control"
      // open question) — every download goes through a short-lived signed
      // URL generated only after the caller's own companyId/permission
      // checks already passed (see src/lib/attachments/service.ts).
      const command = new GetObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
      });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },
    async deleteObject(objectKey) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    },
  };
}
