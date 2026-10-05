import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Encrypts the storage secret access key at rest (CompanySettings.
// storageSecretAccessKey). AES-256-GCM; stored as "enc:v1:<iv>.<tag>.<data>"
// (base64url). Values without that prefix are legacy plaintext and are still
// readable — they get re-saved encrypted the next time they are read (see
// getStorageBackendForCompany) or the profile is saved.
//
// Key: STORAGE_ENCRYPTION_KEY (any string, hashed to 32 bytes). If it is not
// set, a key is derived from DATABASE_URL so existing deployments work with no
// new setting — but then the secret is only as protected as that URL, and
// changing DATABASE_URL makes the stored secret unreadable (the admin simply
// re-enters it). Set STORAGE_ENCRYPTION_KEY in production and keep it stable.
const PREFIX = "enc:v1:";

function key() {
  const explicit = process.env.STORAGE_ENCRYPTION_KEY?.trim();
  if (explicit) return createHash("sha256").update(`apollox-storage-secret-v1:${explicit}`).digest();
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) return createHash("sha256").update(`apollox-storage-secret-derived-v1:${databaseUrl}`).digest();
  if (process.env.NODE_ENV !== "production") return createHash("sha256").update("apollox-dev-storage-secret").digest();
  throw new Error("STORAGE_ENCRYPTION_KEY_MISSING");
}

export function isEncryptedSecret(value: string | null | undefined) {
  return !!value && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${PREFIX}${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}

/** Returns the plaintext, or null if the value cannot be decrypted (wrong/changed key, corrupt). Legacy plaintext passes through. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isEncryptedSecret(stored)) return stored;
  try {
    const [iv, tag, data] = stored.slice(PREFIX.length).split(".");
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
