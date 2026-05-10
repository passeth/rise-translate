import { getServerEnv } from "@/lib/env";

export class TranslationWorkerNotReadyError extends Error {
  constructor(message = "Server translation worker is not configured for live media forwarding.") {
    super(message);
    this.name = "TranslationWorkerNotReadyError";
  }
}

export function getServerTranslationReadiness({ allowDryRun = true }: { allowDryRun?: boolean } = {}) {
  const env = getServerEnv();
  const dryRunEnabled = env.TRANSLATION_WORKER_DRY_RUN === "true";
  const adapter = env.TRANSLATION_WORKER_ADAPTER;

  if (dryRunEnabled) {
    return {
      ready: allowDryRun,
      mode: "dry-run" as const,
      message: allowDryRun
        ? "Dry-run translation worker is enabled for scaffold smoke tests only."
        : "Dry-run translation worker is enabled for scaffold smoke tests only and cannot start buyer-meeting server interpretation.",
    };
  }

  if (adapter === "livekit-node") {
    const missing = [
      ["LIVEKIT_URL", env.LIVEKIT_URL],
      ["LIVEKIT_API_KEY", env.LIVEKIT_API_KEY],
      ["LIVEKIT_API_SECRET", env.LIVEKIT_API_SECRET],
      ["OPENAI_API_KEY", env.OPENAI_API_KEY],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      return {
        ready: false,
        mode: "livekit-node" as const,
        message: `LiveKit Node translation worker is selected but missing ${missing.join(", ")}.`,
      };
    }

    return {
      ready: true,
      mode: "livekit-node" as const,
      message: "LiveKit Node translation worker is configured for server-side media forwarding.",
    };
  }

  return {
    ready: false,
    mode: "unavailable" as const,
    message:
      "Server translation worker is not configured. Use in-room browser translation fallback, or deploy a LiveKit Agent/WebRTC-capable media adapter before starting server translation sessions.",
  };
}

export function assertServerTranslationReady(options: { allowDryRun?: boolean } = {}) {
  const readiness = getServerTranslationReadiness(options);
  if (!readiness.ready) {
    throw new TranslationWorkerNotReadyError(readiness.message);
  }
  return readiness;
}
