/**
 * Token encryption utilities for OAuth access/refresh tokens stored in the database.
 * Uses AES-256-GCM with a key derived from JWT_SECRET so tokens are encrypted at rest.
 */
import crypto from "node:crypto";
import { ENV } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const TAG_LENGTH = 16;
const ENCODING = "base64url";

/** Derive a 32-byte key from the JWT_SECRET using SHA-256. */
function deriveKey(): Buffer {
  const secret = ENV.cookieSecret;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET must be at least 16 characters to enable token encryption.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string. Returns a compact `iv.tag.ciphertext` base64url string.
 * Returns null if plaintext is null/undefined.
 */
export function encryptToken(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64url(iv) . base64url(tag) . base64url(ciphertext)
  return [iv.toString(ENCODING), tag.toString(ENCODING), encrypted.toString(ENCODING)].join(".");
}

/**
 * Decrypt a token previously encrypted with encryptToken.
 * Returns null if ciphertext is null/undefined or decryption fails.
 */
export function decryptToken(ciphertext: string | null | undefined): string | null {
  if (ciphertext == null) return null;
  // Support legacy plaintext tokens that were stored before encryption was added.
  // They won't contain exactly 2 dots in the expected positions.
  const parts = ciphertext.split(".");
  if (parts.length !== 3) {
    // Treat as unencrypted legacy value — return as-is.
    return ciphertext;
  }
  try {
    const key = deriveKey();
    const iv = Buffer.from(parts[0], ENCODING);
    const tag = Buffer.from(parts[1], ENCODING);
    const encrypted = Buffer.from(parts[2], ENCODING);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    // Decryption failed — could be a legacy plaintext token with dots in it.
    return ciphertext;
  }
}
