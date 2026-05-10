import { randomBytes } from "crypto";

const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_CODE_LENGTH = 6;

export function generatePublicRoomToken() {
  return `m_${generateInviteCode()}`;
}

export function toLiveKitRoomName(publicToken: string) {
  return `lk_${publicToken}`;
}

function generateInviteCode() {
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  return Array.from(bytes, (byte) => INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length]).join("");
}
