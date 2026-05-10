import { getClientEnv } from "@/lib/env";

export type MeetingInvite = {
  title: string;
  publicToken: string;
  password: string;
  scheduledStartAt: string;
};

export function getMeetingUrl(publicToken: string) {
  return buildMeetingUrl(getClientEnv().NEXT_PUBLIC_APP_URL, publicToken);
}

export function buildMeetingUrl(appUrl: string, publicToken: string) {
  const normalizedAppUrl = appUrl.replace(/\/$/, "");
  return `${normalizedAppUrl}/meeting/${publicToken}`;
}

export function isLocalInvitationUrl(appUrl: string) {
  try {
    const url = new URL(appUrl);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return true;
  }
}

export function buildInvitationText(invite: MeetingInvite) {
  const meetingUrl = getMeetingUrl(invite.publicToken);
  const scheduledTime = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(invite.scheduledStartAt));

  return [
    `Meeting: ${invite.title}`,
    `Meeting link: ${meetingUrl}`,
    `Meeting password: ${invite.password}`,
    `Meeting time: ${scheduledTime}`,
    "",
    "How to join:",
    "1. Open the meeting link.",
    "2. Enter your name and company.",
    "3. Select your speaking language and listening language.",
    "4. Enter the meeting password and join.",
  ].join("\n");
}
