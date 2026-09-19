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
  // 2026-09-19 — user report: "local dev is working well with logos but
  // online render still not showing logo." Root cause: this always forced
  // Content-Disposition: attachment (see s3-compatible-backend.ts), which
  // is correct for a real download (a job attachment, an RFQ quote file —
  // see the disposition param's own comment there) but wrong for a logo,
  // which needs to render inline in <img> tags, the sidebar, print
  // letterheads, and the browser tab favicon. Confirmed directly: visiting
  // the logo route's URl in a browser triggered a file download instead of
  // showing the image — and the dev-only local-disk backend (used whenever
  // NODE_ENV !== "production", i.e. always in local dev) never set any
  // Content-Disposition header at all, which is exactly why "local dev is
  // working well" while production, which always goes through this S3
  // backend, was not. `disposition` lets a caller opt into "inline"
  // instead; existing callers that don't pass it keep the previous
  // "attachment" behavior unchanged.
  getSignedDownloadUrl(objectKey: string, fileName: string, expiresInSeconds?: number, disposition?: "inline" | "attachment"): Promise<string>;
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
