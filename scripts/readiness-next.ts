import { getClientEnv, getServerEnv } from "@/lib/env";
import { assertPublicHttpsUrl } from "./deployment-smoke";
import { checkRuntimeEnv } from "@/server/operations/runtime-env-manifest";
import { getRecordingStorageConfig } from "@/server/recordings/livekit-egress";
import { buildRecordingStorageSetupGuide } from "@/server/recordings/storage-setup";
import { getServerTranslationReadiness } from "@/server/translation/readiness";
import { evaluateLiveQaChecklist } from "./live-qa-check";
import { readWorkerStatus } from "./translation-worker-supervisor";
import { readFileSync } from "node:fs";

const LIVE_QA_CHECKLIST_PATH = ".scratch/realtime-translation-meeting-app/qa/LIVE-QA-CHECKLIST.md";

export type ReadinessNextItem = {
  id: string;
  title: string;
  action: string;
};

export function getReadinessNextItems({
  liveQaMarkdown,
}: {
  liveQaMarkdown?: string;
} = {}): ReadinessNextItem[] {
  const env = getServerEnv();
  const items: ReadinessNextItem[] = [];

  try {
    assertPublicHttpsUrl(getClientEnv().NEXT_PUBLIC_APP_URL);
  } catch {
    items.push({
      id: "public-app-url",
      title: "Set the public HTTPS app URL",
      action: "Deploy the web app and set NEXT_PUBLIC_APP_URL to the deployed https:// origin, then run pnpm deployment:smoke.",
    });
  }

  const webEnv = checkRuntimeEnv("web");
  if (!webEnv.ok) {
    items.push({
      id: "web-env",
      title: "Complete required web runtime env",
      action: `Set missing web env vars: ${webEnv.missing.join(", ")}. Then run pnpm env:check web.`,
    });
  }

  const workerEnv = checkRuntimeEnv("worker");
  if (!workerEnv.ok) {
    items.push({
      id: "worker-env",
      title: "Complete required worker runtime env",
      action: `Set missing worker env vars: ${workerEnv.missing.join(", ")}. Then run pnpm env:check worker.`,
    });
  }

  if (!getRecordingStorageConfig()) {
    const storageSetup = buildRecordingStorageSetupGuide(env);
    const missingRecordingVars = [
      ["LIVEKIT_RECORDING_S3_BUCKET", env.LIVEKIT_RECORDING_S3_BUCKET],
      ["LIVEKIT_RECORDING_S3_ACCESS_KEY", env.LIVEKIT_RECORDING_S3_ACCESS_KEY],
      ["LIVEKIT_RECORDING_S3_SECRET_KEY", env.LIVEKIT_RECORDING_S3_SECRET_KEY],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    items.push({
      id: "recording-storage",
      title: "Configure recording storage",
      action: `Open ${storageSetup.dashboardUrl}, generate Supabase Storage S3 access keys, set ${
        missingRecordingVars.length > 0 ? missingRecordingVars.join(", ") : "recording S3 credentials"
      }, then run pnpm recording:storage:setup and pnpm recording:storage:finalize.`,
    });
  }

  const translation = getServerTranslationReadiness({ allowDryRun: false });
  if (!translation.ready) {
    items.push({
      id: "translation-worker",
      title: "Enable live server translation worker",
      action:
        "Set TRANSLATION_WORKER_ADAPTER=livekit-node with LiveKit/OpenAI credentials, then run pnpm translation:worker:smoke.",
    });
  }

  const workerStatus = readWorkerStatus();
  if (!workerStatus.running) {
    items.push({
      id: "translation-worker-status",
      title: "Start the long-running translation worker",
      action:
        "Run pnpm translation:worker:start, then pnpm translation:worker:status before Live QA so server-side interpretation can claim LiveKit sessions.",
    });
  }

  const qa = evaluateLiveQaChecklist(liveQaMarkdown ?? readOptionalChecklist());
  if (
    qa.metadataMissing.length > 0 ||
    qa.pendingRows.length > 0 ||
    qa.failedRows.length > 0 ||
    !qa.readySelected ||
    qa.notReadySelected ||
    qa.blockers.length > 0
  ) {
    items.push({
      id: "live-qa",
      title: "Complete two-device Live QA evidence",
      action:
        "Fill .scratch/realtime-translation-meeting-app/qa/LIVE-QA-CHECKLIST.md from a real deployed two-device session, then run pnpm liveqa:check.",
    });
  }

  // If the URL is still local, deployment smoke cannot pass yet; keep this separate
  // so operators see both the env value to change and the exact gate to rerun.
  if (items.some((item) => item.id === "public-app-url")) {
    items.push({
      id: "deployment-smoke",
      title: "Run deployment smoke after URL is fixed",
      action: "After NEXT_PUBLIC_APP_URL is public HTTPS, run pnpm deployment:smoke.",
    });
  } else if (items.length > 0) {
    items.push({
      id: "deployed-preflight",
      title: "Run deployed internal preflight after env changes",
      action:
        "After setting missing production env vars and redeploying, run pnpm deployed:preflight to verify the deployed Vercel function sees the same readiness state.",
    });
  }

  if (items.length === 0 && env.NEXT_PUBLIC_APP_URL) {
    items.push({
      id: "final-readiness",
      title: "Run final readiness gate",
      action:
        "Run pnpm readiness:report -- --json=/tmp/readiness-results.json, pnpm completion:audit /tmp/readiness-results.json, and pnpm readiness:check.",
    });
  }

  return items;
}

export function formatReadinessNext(items: ReadinessNextItem[]) {
  return [
    "Next readiness actions",
    ...items.map((item, index) => `${index + 1}. ${item.title}\n   ${item.action}`),
  ].join("\n");
}

function readOptionalChecklist() {
  try {
    return readFileSync(LIVE_QA_CHECKLIST_PATH, "utf8");
  } catch {
    return "";
  }
}

if (process.argv[1]?.endsWith("readiness-next.ts")) {
  console.log(formatReadinessNext(getReadinessNextItems()));
}
