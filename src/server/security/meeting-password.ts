import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { requireEnv } from "@/lib/env";

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function generateMeetingPassword() {
  return randomBytes(4).readUInt32BE(0).toString().slice(0, 6).padStart(6, "0");
}

export function hashMeetingPassword(meetingId: string, password: string) {
  const pepper = requireEnv("APP_ENCRYPTION_KEY_BASE64");
  return createHash("sha256")
    .update(`${pepper}:${meetingId}:${password}`)
    .digest("hex");
}

export function encryptMeetingPassword(password: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function decryptMeetingPassword(payload: string) {
  const key = getEncryptionKey();
  const bytes = Buffer.from(payload, "base64url");
  const iv = bytes.subarray(0, IV_LENGTH);
  const authTag = bytes.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = bytes.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function getEncryptionKey() {
  const raw = Buffer.from(requireEnv("APP_ENCRYPTION_KEY_BASE64"), "base64");

  if (raw.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY_BASE64 must decode to 32 bytes");
  }

  return raw;
}
