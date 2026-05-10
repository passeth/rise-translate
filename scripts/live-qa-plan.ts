import { getClientEnv } from "@/lib/env";

export type LiveQaPlanInput = {
  appUrl: string;
  checklistPath?: string;
  hostProfile?: string;
  guestProfile?: string;
};

const DEFAULT_CHECKLIST_PATH = ".scratch/realtime-translation-meeting-app/qa/LIVE-QA-CHECKLIST.md";

export function buildLiveQaPlan({
  appUrl,
  checklistPath = DEFAULT_CHECKLIST_PATH,
  hostProfile = "Host: Korean speaking / English listening",
  guestProfile = "Guest: English or Russian speaking / Korean listening",
}: LiveQaPlanInput) {
  const origin = normalizeOrigin(appUrl);

  return [
    "# Two-device Live QA run plan",
    "",
    "## Goal",
    "Prove the deployed EVAS Translation Meetings app is ready for an internal buyer pilot with real microphones, LiveKit media, server-side translation, captions, notes, recording, and cleanup.",
    "This command is a run guide only; it does not mark any checklist item as passed.",
    "",
    "## Environment",
    `- App URL: ${origin}`,
    `- Checklist: ${checklistPath}`,
    `- ${hostProfile}`,
    `- ${guestProfile}`,
    "",
    "## Before opening browsers",
    "1. Confirm Supabase recording S3 credentials are configured and promoted. If they are missing, stop here because recording cannot pass.",
    "2. Run `pnpm recording:storage:finalize` after credentials are present.",
    "3. Run `pnpm readiness:next` and resolve every non-Live-QA blocker.",
    "4. Run `pnpm translation:worker:start` and verify `pnpm translation:worker:status` is running.",
    "5. Keep `.omx/logs/translation-worker.log` visible during the meeting.",
    "",
    "## Browser/device setup",
    `1. Device A: open ${origin}/login, sign in as host, create a new meeting, and copy invitation text.`,
    "2. Device B: open the invitation link in a different physical device/browser profile, enter name/company/languages/password, and join as guest.",
    "3. Use headphones or separated devices to avoid acoustic feedback.",
    "",
    "## Required speech script",
    "Test at least Korean ↔ English/Russian. If the next real buyer meeting uses Chinese/Japanese/Vietnamese, add that target language in the same run.",
    "1. Host says in Korean: 오늘 회의에서는 납기, 최소 주문 수량, 결제 조건을 확인하겠습니다.",
    "2. Guest replies in English or Russian with a date, quantity, and action item.",
    "3. Both speakers intentionally pause between sentences so captions can finalize.",
    "4. Change one participant listening language and speak one more sentence to prove track switching.",
    "",
    "## Evidence to capture in checklist notes",
    "- Invitation URL uses deployed HTTPS origin, not localhost.",
    "- Translation worker is running and translation status changes from starting to connected after audio appears.",
    "- Listener hears only the selected translated track and no duplicate browser/server translation audio.",
    "- Captions are readable, non-spammy, and persist into transcript rows.",
    "- Recording start/stop works, playback URL opens, object exists in storage, and expiry is 7 days.",
    "- Markdown notes include buyer, quantity/date/payment/action items.",
    "- Meeting end removes guests and stops active translation/recording lanes cleanly.",
    "- Each checklist row you observed is changed to `☑ Pass ☐ Fail`; unobserved rows stay pending.",
    "",
    "## Final commands",
    "```bash",
    "pnpm liveqa:check",
    "pnpm readiness:report -- --json=/tmp/rise-translate-readiness-results.json",
    "pnpm completion:audit /tmp/rise-translate-readiness-results.json",
    "```",
  ].join("\n");
}

function normalizeOrigin(value: string) {
  const url = new URL(value);
  return url.origin;
}

function main() {
  const appUrlArg = process.argv.find((arg) => arg.startsWith("--app-url="));
  const checklistArg = process.argv.find((arg) => arg.startsWith("--checklist="));
  const appUrl = appUrlArg?.slice("--app-url=".length) || getClientEnv().NEXT_PUBLIC_APP_URL;
  const checklistPath = checklistArg?.slice("--checklist=".length) || DEFAULT_CHECKLIST_PATH;
  console.log(buildLiveQaPlan({ appUrl, checklistPath }));
}

if (process.argv[1]?.endsWith("live-qa-plan.ts")) {
  main();
}
