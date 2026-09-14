// Storage backend abstraction — see
// claude/decision-storage-architecture-render-plus-object-storage.md.
// Cloudflare R2, Backblaze B2, and any other S3-compatible service are all
// reached through the same S3 API, so one implementation
// (s3-compatible-backend.ts) covers all of them; only the endpoint/region/
// credentials differ per company (see src/lib/storage/index.ts).
// local-disk-backend.ts is a non-production fallback only, so `next dev`
// works with zero bucket setup.
export interface StorageBackend {
  /** Stored on the Attachment row's `provider` column — "R2" | "B2" | "S3_COMPATIBLE" | "LOCAL_DEV". */
  readonly providerName: string;
  putObject(objectKey: string, body: Buffer, contentType: string): Promise<void>;
  getSignedDownloadUrl(objectKey: string, fileName: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(objectKey: string): Promise<void>;
}

export type S3CompatibleConfig = {
  provider: "R2" | "B2" | "S3_COMPATIBLE";
  bucket: string;
  region: string;
  endpoint?: string | null;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};
