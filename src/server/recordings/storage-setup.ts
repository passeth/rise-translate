import { getServerEnv } from "@/lib/env";
import { getRecordingStorageReadiness } from "@/server/recordings/livekit-egress";

const SUPABASE_STORAGE_S3_DOCS_URL = "https://supabase.com/docs/guides/storage/s3/authentication";

export type RecordingStorageSetupGuide = {
  projectRef: string | null;
  dashboardUrl: string;
  docsUrl: string;
  missingEnv: string[];
  steps: string[];
};

export function buildRecordingStorageSetupGuide(env = getServerEnv()): RecordingStorageSetupGuide {
  const projectRef = deriveSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  const readiness = getRecordingStorageReadiness();
  const dashboardUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/storage/s3`
    : "https://supabase.com/dashboard/project/_/storage/s3";

  return {
    projectRef,
    dashboardUrl,
    docsUrl: SUPABASE_STORAGE_S3_DOCS_URL,
    missingEnv: readiness.missingEnv,
    steps: [
      "Open Supabase Dashboard → Storage → S3 Configuration → Access keys.",
      "Generate a new access key pair and copy the Access Key ID plus Secret access key immediately.",
      "Set LIVEKIT_RECORDING_S3_ACCESS_KEY and LIVEKIT_RECORDING_S3_SECRET_KEY in the local process or .env.local without printing the values.",
      "Run pnpm recording:storage:configure, then pnpm recording:storage:finalize.",
      "After finalize redeploys production, run pnpm deployed:preflight and pnpm readiness:next.",
    ],
  };
}

export function formatRecordingStorageSetupGuide(guide: RecordingStorageSetupGuide) {
  return [
    "Recording storage S3 setup",
    `- Supabase project: ${guide.projectRef ?? "unknown"}`,
    `- Dashboard URL: ${guide.dashboardUrl}`,
    `- Docs: ${guide.docsUrl}`,
    `- Missing env: ${guide.missingEnv.length > 0 ? guide.missingEnv.join(", ") : "none"}`,
    "",
    "Steps:",
    ...guide.steps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

export function deriveSupabaseProjectRef(supabaseUrl: string | undefined) {
  if (!supabaseUrl) return null;

  try {
    const hostname = new URL(supabaseUrl).hostname;
    if (hostname.endsWith(".storage.supabase.co")) {
      return hostname.slice(0, -".storage.supabase.co".length) || null;
    }
    if (hostname.endsWith(".supabase.co")) {
      return hostname.slice(0, -".supabase.co".length) || null;
    }
    return null;
  } catch {
    return null;
  }
}
