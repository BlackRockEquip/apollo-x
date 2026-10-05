import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Short-lived signed links for the "Local folder" storage option. S3-style
// backends hand out a presigned URL straight from the bucket; a folder on the
// Apollo X server has no such thing, so the app serves the file itself from
// /api/v1/storage-files/<token> and the token is the credential — exactly the
// same trust model as a presigned URL: it is only ever created AFTER the
// caller's own permission checks passed (see src/lib/attachments/service.ts),
// it names one file, and it expires. The route re-checks the signature and
// expiry; nothing in the token can be changed without invalidating it.
export type StorageLinkPayload = {
  /** company id */
  c: string;
  /** object key */
  k: string;
  /** download file name */
  f: string;
  /** "inline" | "attachment" */
  d: "inline" | "attachment";
  /** expiry, epoch seconds */
  e: number;
};

function signingSecret() {
  const explicit = process.env.STORAGE_SIGNING_SECRET?.trim();
  if (explicit) return explicit;
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) return createHash("sha256").update(`apollox-storage-links-v1:${databaseUrl}`).digest("hex");
  if (process.env.NODE_ENV !== "production") return "apollox-dev-storage-links";
  throw new Error("STORAGE_SIGNING_SECRET_MISSING");
}

function mac(body: string) {
  return createHmac("sha256", signingSecret()).update(body).digest("base64url");
}

export function signStorageLink(payload: StorageLinkPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function verifyStorageLink(token: string, nowSeconds = Math.floor(Date.now() / 1000)): StorageLinkPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StorageLinkPayload;
    if (typeof payload.c !== "string" || typeof payload.k !== "string" || typeof payload.e !== "number") return null;
    if (payload.e < nowSeconds) return null;
    return payload;
  } catch {
    return null;
  }
}
