import { dispose as disposeLiveKitRtc } from "@livekit/rtc-node";
import { runTranslationWorkerLoop } from "@/server/translation/worker-loop";
import { getServerTranslationReadiness } from "@/server/translation/readiness";
import { getTranslationWorkerRuntimeOptions } from "@/server/translation/worker-runtime-options";
import { stopStaleStartingTranslationSessions } from "@/server/translation/stale-session-cleanup";

let running = true;

process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});

async function main() {
  const readiness = getServerTranslationReadiness();
  if (!readiness.ready) {
    console.error(`[translation-worker] Not ready: ${readiness.message}`);
    process.exitCode = 1;
    return;
  }

  const runtimeOptions = getTranslationWorkerRuntimeOptions();
  const cleanup = await stopStaleStartingTranslationSessions().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[translation-worker] Stale session cleanup failed: ${message}`);
    return null;
  });
  if (cleanup) {
    console.info(`[translation-worker] Stale session cleanup: ${JSON.stringify(cleanup)}`);
  }
  console.info(`[translation-worker] Starting in ${readiness.mode} mode.`);
  try {
    const summary = await runTranslationWorkerLoop({
      maxIterations: runtimeOptions.maxIterations,
      idleDelayMs: runtimeOptions.idleDelayMs,
      errorDelayMs: runtimeOptions.errorDelayMs,
      shouldContinue: () => running,
      onError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[translation-worker] Loop error: ${message}`);
      },
    });
    console.info(`[translation-worker] Stopped: ${JSON.stringify(summary)}`);
  } finally {
    disposeLiveKitRtc();
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[translation-worker] Fatal error: ${message}`);
  process.exitCode = 1;
});
