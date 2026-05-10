import { getServerEnv } from "@/lib/env";
import { getServerTranslationReadiness } from "@/server/translation/readiness";

export type ProductionReadinessSeverity = "ok" | "warning" | "blocked";

export type ProductionReadinessCheck = {
  id: string;
  label: string;
  severity: ProductionReadinessSeverity;
  message: string;
  action?: string;
};

export function getProductionReadinessChecks(): ProductionReadinessCheck[] {
  const env = getServerEnv();
  const translation = getServerTranslationReadiness();

  return [
    appUrlCheck(env.NEXT_PUBLIC_APP_URL),
    httpsUrlCheck("supabase-url", "Supabase URL", env.NEXT_PUBLIC_SUPABASE_URL),
    requiredCheck("supabase-publishable-key", "Supabase publishable key", env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    requiredCheck("supabase-service-role", "Supabase service role", env.SUPABASE_SERVICE_ROLE_KEY),
    encryptionKeyCheck(env.APP_ENCRYPTION_KEY_BASE64),
    liveKitUrlCheck(env.LIVEKIT_URL),
    requiredCheck("livekit-api-key", "LiveKit API key", env.LIVEKIT_API_KEY),
    requiredCheck("livekit-api-secret", "LiveKit API secret", env.LIVEKIT_API_SECRET),
    requiredCheck("openai-api-key", "OpenAI API key", env.OPENAI_API_KEY),
    warningCheck("openai-notes-model", "OpenAI notes model", env.OPENAI_NOTES_MODEL, "Meeting notes may use a default/fallback model if unset."),
    requiredCheck("internal-worker-token", "Internal worker token", env.INTERNAL_WORKER_TOKEN),
    recordingStorageCheck(env),
    {
      id: "server-translation-worker",
      label: "Server translation worker",
      severity: translation.mode === "dry-run" ? "blocked" : translation.ready ? "warning" : "blocked",
      message:
        translation.mode === "dry-run"
            ? "Dry-run translation worker is enabled. This is blocked for real buyer meetings because no media is forwarded."
            : translation.ready
            ? `${translation.mode} mode is configured. Before buyer meetings, run: pnpm translation:worker:smoke, then run the long-lived worker with pnpm translation:worker and complete a two-device live translation smoke test.`
            : translation.message,
      action:
        translation.mode === "dry-run"
          ? "Set TRANSLATION_WORKER_DRY_RUN=false and TRANSLATION_WORKER_ADAPTER=livekit-node, then rerun pnpm preflight."
          : translation.ready
          ? "Run pnpm translation:worker:smoke, start pnpm translation:worker as a long-lived process, and complete the Live QA checklist."
          : "Configure the server translation worker environment, then rerun pnpm preflight.",
    },
  ];
}

export function summarizeProductionReadiness(checks: ProductionReadinessCheck[]) {
  const blocked = checks.filter((check) => check.severity === "blocked").length;
  const warnings = checks.filter((check) => check.severity === "warning").length;

  if (blocked > 0) {
    return {
      severity: "blocked" as const,
      message: `${blocked} production readiness blocker${blocked === 1 ? "" : "s"} require attention before buyer meetings.`,
    };
  }

  if (warnings > 0) {
    return {
      severity: "warning" as const,
      message: `${warnings} production readiness warning${warnings === 1 ? "" : "s"} should be reviewed before buyer meetings.`,
    };
  }

  return { severity: "ok" as const, message: "All production readiness checks passed." };
}


function appUrlCheck(value: string | undefined): ProductionReadinessCheck {
  if (!value) {
    return {
      id: "app-url",
      label: "App URL",
      severity: "blocked",
      message: "App URL is missing.",
      action: "Deploy the app to a public HTTPS origin and set NEXT_PUBLIC_APP_URL to that exact origin.",
    };
  }

  try {
    const url = new URL(value);
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      return {
        id: "app-url",
        label: "App URL",
        severity: "blocked",
        message: "App URL points to localhost; buyer invitation links will not work after deployment.",
        action: "Deploy the app and replace NEXT_PUBLIC_APP_URL with the public HTTPS origin used in invitation links.",
      };
    }

    if (url.protocol !== "https:") {
      return {
        id: "app-url",
        label: "App URL",
        severity: "blocked",
        message: "App URL must use HTTPS so buyer invitation links and browser media permissions work reliably.",
        action: "Use an https:// production URL or custom domain for NEXT_PUBLIC_APP_URL.",
      };
    }
  } catch {
    return {
      id: "app-url",
      label: "App URL",
      severity: "blocked",
      message: "App URL is invalid.",
      action: "Set NEXT_PUBLIC_APP_URL to a valid public HTTPS origin, for example https://meet.example.com.",
    };
  }

  return { id: "app-url", label: "App URL", severity: "ok", message: "Configured." };
}

function httpsUrlCheck(id: string, label: string, value: string | undefined): ProductionReadinessCheck {
  if (!value) {
    return {
      id,
      label,
      severity: "blocked",
      message: `${label} is missing.`,
      action: `Set ${envNameFromCheckId(id)} in the production environment.`,
    };
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return {
        id,
        label,
        severity: "blocked",
        message: `${label} must use HTTPS in production.`,
        action: `Set ${envNameFromCheckId(id)} to the provider HTTPS URL.`,
      };
    }
  } catch {
    return {
      id,
      label,
      severity: "blocked",
      message: `${label} is invalid.`,
      action: `Set ${envNameFromCheckId(id)} to a valid provider URL.`,
    };
  }

  return { id, label, severity: "ok", message: "Configured." };
}

function liveKitUrlCheck(value: string | undefined): ProductionReadinessCheck {
  if (!value) {
    return {
      id: "livekit-url",
      label: "LiveKit URL",
      severity: "blocked",
      message: "LiveKit URL is missing.",
      action: "Set LIVEKIT_URL to the wss:// URL from the LiveKit project.",
    };
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "wss:") {
      return {
        id: "livekit-url",
        label: "LiveKit URL",
        severity: "blocked",
        message: "LiveKit URL must use wss:// so browser clients and the worker connect to the secure media endpoint.",
        action: "Set LIVEKIT_URL to the secure wss:// LiveKit Cloud endpoint.",
      };
    }
  } catch {
    return {
      id: "livekit-url",
      label: "LiveKit URL",
      severity: "blocked",
      message: "LiveKit URL is invalid.",
      action: "Set LIVEKIT_URL to a valid wss:// LiveKit endpoint.",
    };
  }

  return { id: "livekit-url", label: "LiveKit URL", severity: "ok", message: "Configured." };
}

function encryptionKeyCheck(value: string | undefined): ProductionReadinessCheck {
  if (!value) {
    return {
      id: "app-encryption-key",
      label: "App encryption key",
      severity: "blocked",
      message: "App encryption key is missing.",
      action: "Generate a 32-byte base64 key with `openssl rand -base64 32` and set APP_ENCRYPTION_KEY_BASE64.",
    };
  }

  const decoded = Buffer.from(value, "base64");
  const roundTrip = decoded.length > 0 && Buffer.from(decoded).toString("base64").replace(/=+$/, "") === value.replace(/=+$/, "");

  if (!roundTrip || decoded.length !== 32) {
    return {
      id: "app-encryption-key",
      label: "App encryption key",
      severity: "blocked",
      message: "App encryption key must be valid base64 that decodes to exactly 32 bytes.",
      action: "Regenerate the value with `openssl rand -base64 32` and keep it stable for existing meeting passwords.",
    };
  }

  return { id: "app-encryption-key", label: "App encryption key", severity: "ok", message: "Configured." };
}

function requiredCheck(id: string, label: string, value: string | undefined): ProductionReadinessCheck {
  return value
    ? { id, label, severity: "ok", message: "Configured." }
    : {
        id,
        label,
        severity: "blocked",
        message: `${label} is missing.`,
        action: `Set ${envNameFromCheckId(id)} in the production environment.`,
      };
}

function warningCheck(
  id: string,
  label: string,
  value: string | undefined,
  warningMessage: string,
): ProductionReadinessCheck {
  return value
    ? { id, label, severity: "ok", message: "Configured." }
    : { id, label, severity: "warning", message: warningMessage, action: `Set ${envNameFromCheckId(id)} if you want to override the default.` };
}

function recordingStorageCheck(env: ReturnType<typeof getServerEnv>): ProductionReadinessCheck {
  const required = [
    ["LIVEKIT_RECORDING_S3_BUCKET", env.LIVEKIT_RECORDING_S3_BUCKET],
    ["LIVEKIT_RECORDING_S3_ACCESS_KEY", env.LIVEKIT_RECORDING_S3_ACCESS_KEY],
    ["LIVEKIT_RECORDING_S3_SECRET_KEY", env.LIVEKIT_RECORDING_S3_SECRET_KEY],
  ] as const;
  const missing = required.filter(([, value]) => !value).map(([key]) => key);

  if (missing.length > 0) {
    return {
      id: "recording-storage",
      label: "Recording storage",
      severity: "blocked",
      message: `Recording storage is incomplete (${missing.join(", ")}); LiveKit Egress playback/retention cannot be trusted.`,
      action:
        "Create/choose the recording bucket and S3-compatible access key, set the missing LIVEKIT_RECORDING_S3_* variables, then run pnpm recording:storage:smoke.",
    };
  }

  return {
    id: "recording-storage",
    label: "Recording storage",
    severity: "ok",
    message: env.LIVEKIT_RECORDING_S3_ENDPOINT
      ? "Configured with explicit S3 endpoint."
      : "Configured; direct Supabase Storage S3 endpoint will be derived from Supabase URL.",
  };
}

function envNameFromCheckId(id: string) {
  const names: Record<string, string> = {
    "supabase-url": "NEXT_PUBLIC_SUPABASE_URL",
    "supabase-publishable-key": "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "supabase-service-role": "SUPABASE_SERVICE_ROLE_KEY",
    "livekit-api-key": "LIVEKIT_API_KEY",
    "livekit-api-secret": "LIVEKIT_API_SECRET",
    "openai-api-key": "OPENAI_API_KEY",
    "openai-notes-model": "OPENAI_NOTES_MODEL",
    "internal-worker-token": "INTERNAL_WORKER_TOKEN",
  };

  return names[id] ?? id.toUpperCase().replaceAll("-", "_");
}
