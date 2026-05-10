import { randomBytes } from "crypto";

export function generatePublicRoomToken() {
  return `m_${randomBytes(18).toString("base64url")}`;
}

export function toLiveKitRoomName(publicToken: string) {
  return `lk_${publicToken}`;
}
