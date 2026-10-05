import type { StorageProfile } from "@/lib/storage/types";
import { isUsableLocalFolderPath } from "@/lib/storage/local-folder-backend";
import { decryptSecret } from "@/lib/storage/secret-crypto";

// What the Platform "Storage location" form submits. One shape for all four
// options; only the fields that option uses are read.
export type StorageProfileInput = {
  /** "" = no override: the company uses the platform default. */
  provider: "" | "R2" | "B2" | "S3_COMPATIBLE" | "LOCAL_FOLDER";
  /** Cloudflare R2 only: the 32-character Cloudflare Account ID. */
  accountId?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  /** Write-only: blank means "keep the stored secret". */
  secretAccessKey?: string;
  /** LOCAL_FOLDER only. */
  localPath?: string;
};

export function r2EndpointForAccount(accountId: string) {
  return `https://${accountId.trim().toLowerCase()}.r2.cloudflarestorage.com`;
}

/** Reverse of r2EndpointForAccount, so the form can show the Account ID again. */
export function accountIdFromR2Endpoint(endpoint: string | null | undefined) {
  const match = /^https:\/\/([a-f0-9]{32})(?:\.[a-z]+)?\.r2\.cloudflarestorage\.com\/?$/i.exec(endpoint ?? "");
  return match ? match[1].toLowerCase() : "";
}

const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;

export type StoredStorageSettings = {
  storageProvider: "R2" | "B2" | "S3_COMPATIBLE" | "LOCAL_FOLDER" | null;
  storageBucket: string | null;
  storageRegion: string | null;
  storageEndpoint: string | null;
  storageAccessKeyId: string | null;
  storageSecretAccessKey: string | null;
  storageLocalPath: string | null;
} | null | undefined;

/**
 * Turns the form input (plus the already-stored secret, when the form left
 * the secret blank) into a StorageProfile. Throws a STORAGE_* error code the
 * caller maps to a readable message. Returns null for provider "" (no override).
 */
export function buildStorageProfile(input: StorageProfileInput, stored: StoredStorageSettings): StorageProfile | null {
  if (input.provider === "") return null;
  if (input.provider === "LOCAL_FOLDER") {
    const localPath = (input.localPath ?? "").trim();
    if (!localPath) throw new Error("STORAGE_LOCAL_PATH_REQUIRED");
    if (!isUsableLocalFolderPath(localPath)) throw new Error("STORAGE_LOCAL_PATH_INVALID");
    return { provider: "LOCAL_FOLDER", localPath };
  }
  const bucket = (input.bucket ?? "").trim();
  const accessKeyId = (input.accessKeyId ?? "").trim();
  if (input.provider === "R2") {
    const accountId = (input.accountId ?? "").trim();
    if (!accountId) throw new Error("STORAGE_ACCOUNT_ID_REQUIRED");
    if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error("STORAGE_ACCOUNT_ID_INVALID");
  }
  if (!bucket) throw new Error("STORAGE_BUCKET_REQUIRED");
  if (!accessKeyId) throw new Error("STORAGE_ACCESS_KEY_REQUIRED");
  const secretAccessKey = (input.secretAccessKey ?? "").trim() || decryptSecret(stored?.storageSecretAccessKey) || "";
  if (!secretAccessKey) throw new Error("STORAGE_SECRET_KEY_REQUIRED");
  if (input.provider === "R2") {
    return { provider: "R2", bucket, region: "auto", endpoint: r2EndpointForAccount(input.accountId ?? ""), accessKeyId, secretAccessKey };
  }
  const endpoint = (input.endpoint ?? "").trim();
  if (!endpoint) throw new Error("STORAGE_ENDPOINT_REQUIRED");
  return { provider: input.provider, bucket, region: (input.region ?? "").trim() || "auto", endpoint, accessKeyId, secretAccessKey };
}

/** True when saving `next` would change where this company's files go (or how they are reached). */
export function storageProfileChanged(next: StorageProfile | null, input: StorageProfileInput, stored: StoredStorageSettings) {
  const before = stored?.storageProvider ?? null;
  const after = next?.provider ?? null;
  if (before !== after) return true;
  if (!next) return false;
  if (next.provider === "LOCAL_FOLDER") return (stored?.storageLocalPath ?? "") !== (next.localPath ?? "");
  return (
    (stored?.storageBucket ?? "") !== (next.bucket ?? "") ||
    (stored?.storageEndpoint ?? "") !== (next.endpoint ?? "") ||
    (stored?.storageAccessKeyId ?? "") !== (next.accessKeyId ?? "") ||
    !!(input.secretAccessKey ?? "").trim()
  );
}

export const STORAGE_ERROR_MESSAGES: Record<string, string> = {
  STORAGE_BUCKET_REQUIRED: "Enter the bucket name.",
  STORAGE_ACCESS_KEY_REQUIRED: "Enter the access key ID.",
  STORAGE_SECRET_KEY_REQUIRED: "Enter the secret access key.",
  STORAGE_ACCOUNT_ID_REQUIRED: "Enter the Cloudflare Account ID.",
  STORAGE_ACCOUNT_ID_INVALID: "The Cloudflare Account ID is 32 letters/numbers (copy it from the Cloudflare dashboard, right-hand side of the R2 page).",
  STORAGE_ENDPOINT_REQUIRED: "Enter the endpoint URL for this provider.",
  STORAGE_LOCAL_PATH_REQUIRED: "Enter the folder path on the server.",
  STORAGE_LOCAL_PATH_INVALID: "The folder must be a full path (for example D:\\ApolloFiles or /var/apollox/files) and must not contain \"..\".",
  STORAGE_SECRET_UNREADABLE: "The saved secret key can no longer be decrypted (the encryption key changed). Enter the secret access key again and save.",
  STORAGE_EXISTING_FILES_ACK_REQUIRED: "This company already has stored files. Export them first, then tick the box confirming you understand they will not open from Apollo X after the change.",
  PLATFORM_CONTEXT_REQUIRED: "Open this from the Platform area.",
  RESOURCE_NOT_FOUND: "Company not found.",
};
