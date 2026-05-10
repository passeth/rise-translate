export type RuntimeProcessName = "web" | "worker";

export type RuntimeEnvManifestEntry = {
  name: string;
  requiredBy: RuntimeProcessName[];
  secret: boolean;
  optional?: boolean;
  purpose: string;
};

export const RUNTIME_ENV_MANIFEST: RuntimeEnvManifestEntry[] = [
  {
    name: "NEXT_PUBLIC_APP_URL",
    requiredBy: ["web", "worker"],
    secret: false,
    purpose: "Public HTTPS origin used for invitation links, deployment smoke, and runtime URL generation.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    requiredBy: ["web", "worker"],
    secret: false,
    purpose: "Supabase project URL used by browser clients, server routes, and the worker.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    requiredBy: ["web"],
    secret: false,
    purpose: "Browser-safe Supabase publishable key for client auth/data access.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    requiredBy: ["web", "worker"],
    secret: true,
    purpose: "Server-side Supabase access for meeting control, transcripts, operational events, and worker polling.",
  },
  {
    name: "APP_ENCRYPTION_KEY_BASE64",
    requiredBy: ["web"],
    secret: true,
    purpose: "Stable 32-byte base64 key for encrypting/decrypting meeting passwords.",
  },
  {
    name: "LIVEKIT_URL",
    requiredBy: ["web", "worker"],
    secret: false,
    purpose: "Secure wss:// LiveKit endpoint for browser clients and the server translation worker.",
  },
  {
    name: "LIVEKIT_API_KEY",
    requiredBy: ["web", "worker"],
    secret: true,
    purpose: "LiveKit server API key for issuing tokens, recording controls, and worker room access.",
  },
  {
    name: "LIVEKIT_API_SECRET",
    requiredBy: ["web", "worker"],
    secret: true,
    purpose: "LiveKit server API secret for issuing tokens, recording controls, and worker room access.",
  },
  {
    name: "OPENAI_API_KEY",
    requiredBy: ["web", "worker"],
    secret: true,
    purpose: "OpenAI API key for browser fallback client secrets, server realtime translation, and meeting notes.",
  },
  {
    name: "OPENAI_TRANSLATION_MODEL",
    requiredBy: ["web", "worker"],
    secret: false,
    purpose: "Realtime Translation model. Defaults to gpt-realtime-translate.",
  },
  {
    name: "OPENAI_TRANSCRIPTION_MODEL",
    requiredBy: ["web", "worker"],
    secret: false,
    purpose: "Realtime Translation transcription model. Defaults to gpt-realtime-whisper.",
  },
  {
    name: "OPENAI_NOTES_MODEL",
    requiredBy: ["web"],
    secret: false,
    optional: true,
    purpose: "Meeting-notes model override. Optional; defaults are handled by the notes generator/smoke gate.",
  },
  {
    name: "INTERNAL_WORKER_TOKEN",
    requiredBy: ["web", "worker"],
    secret: true,
    purpose: "Shared internal token for protected cron/internal transcript endpoints.",
  },
  {
    name: "TRANSLATION_WORKER_ADAPTER",
    requiredBy: ["web", "worker"],
    secret: false,
    purpose: "Must be livekit-node for production server-side interpretation.",
  },
  {
    name: "TRANSLATION_WORKER_DRY_RUN",
    requiredBy: ["web", "worker"],
    secret: false,
    optional: true,
    purpose: "Optional safety flag. Omit or set false for buyer meetings; true is only for scaffold smoke tests.",
  },
  {
    name: "LIVEKIT_RECORDING_S3_BUCKET",
    requiredBy: ["web"],
    secret: false,
    purpose: "S3-compatible recording bucket used by LiveKit Egress.",
  },
  {
    name: "LIVEKIT_RECORDING_S3_ACCESS_KEY",
    requiredBy: ["web"],
    secret: true,
    purpose: "S3-compatible access key for recording output.",
  },
  {
    name: "LIVEKIT_RECORDING_S3_SECRET_KEY",
    requiredBy: ["web"],
    secret: true,
    purpose: "S3-compatible secret key for recording output.",
  },
  {
    name: "LIVEKIT_RECORDING_S3_REGION",
    requiredBy: ["web"],
    secret: false,
    optional: true,
    purpose: "S3-compatible region from the provider's S3 configuration; defaults to auto when omitted.",
  },
  {
    name: "LIVEKIT_RECORDING_S3_ENDPOINT",
    requiredBy: ["web"],
    secret: false,
    optional: true,
    purpose: "Optional explicit S3 endpoint; blank derives the direct Supabase Storage S3 endpoint.",
  },
  {
    name: "LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE",
    requiredBy: ["web"],
    secret: false,
    optional: true,
    purpose: "Path-style S3 addressing flag; true is recommended for Supabase Storage.",
  },
];

export function getRuntimeEnvManifest(processName?: RuntimeProcessName) {
  return processName
    ? RUNTIME_ENV_MANIFEST.filter((entry) => entry.requiredBy.includes(processName))
    : RUNTIME_ENV_MANIFEST;
}

export function formatRuntimeEnvManifest(processName?: RuntimeProcessName) {
  const entries = getRuntimeEnvManifest(processName);
  return entries
    .map((entry) => {
      const visibility = entry.secret ? "secret" : "non-secret";
      const requirement = entry.optional ? "optional" : "required";
      return `- ${entry.name} (${visibility}; ${requirement}; ${entry.requiredBy.join("+")}): ${entry.purpose}`;
    })
    .join("\n");
}

export function formatRuntimeEnvTemplate(processName: RuntimeProcessName) {
  return getRuntimeEnvManifest(processName)
    .map((entry) => {
      const requirement = entry.optional ? "optional" : "required";
      const value = defaultTemplateValue(entry.name);
      return [`# ${requirement}; ${entry.secret ? "secret" : "non-secret"}; ${entry.purpose}`, `${entry.name}=${value}`].join(
        "\n",
      );
    })
    .join("\n\n");
}

export function checkRuntimeEnv(processName: RuntimeProcessName, env: Record<string, string | undefined> = process.env) {
  const entries = getRuntimeEnvManifest(processName);
  const missing = entries.filter((entry) => !entry.optional && !hasEnvValue(env, entry.name));

  return {
    processName,
    ok: missing.length === 0,
    checked: entries.length,
    missing: missing.map((entry) => entry.name),
  };
}

function defaultTemplateValue(name: string) {
  const defaults: Record<string, string> = {
    OPENAI_TRANSLATION_MODEL: "gpt-realtime-translate",
    OPENAI_TRANSCRIPTION_MODEL: "gpt-realtime-whisper",
    TRANSLATION_WORKER_ADAPTER: "livekit-node",
    TRANSLATION_WORKER_DRY_RUN: "false",
    LIVEKIT_RECORDING_S3_BUCKET: "recordings",
    LIVEKIT_RECORDING_S3_REGION: "auto",
    LIVEKIT_RECORDING_S3_FORCE_PATH_STYLE: "true",
  };

  return defaults[name] ?? "";
}

function hasEnvValue(env: Record<string, string | undefined>, name: string) {
  const value = env[name];
  return typeof value === "string" && value.trim().length > 0;
}
