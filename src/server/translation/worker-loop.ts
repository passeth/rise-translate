import { TranslationWorker, type TranslationWorkerRunResult } from "@/server/translation/worker";

export type TranslationWorkerLoopOptions = {
  worker?: Pick<TranslationWorker, "runOnce">;
  idleDelayMs?: number;
  errorDelayMs?: number;
  maxIterations?: number;
  shouldContinue?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
};

export type TranslationWorkerLoopSummary = {
  iterations: number;
  processedSessions: number;
  idleIterations: number;
  errors: number;
};

const DEFAULT_IDLE_DELAY_MS = 1_000;
const DEFAULT_ERROR_DELAY_MS = 5_000;

export async function runTranslationWorkerLoop({
  worker = new TranslationWorker(),
  idleDelayMs = DEFAULT_IDLE_DELAY_MS,
  errorDelayMs = DEFAULT_ERROR_DELAY_MS,
  maxIterations = Number.POSITIVE_INFINITY,
  shouldContinue = () => true,
  sleep = defaultSleep,
  onError,
}: TranslationWorkerLoopOptions = {}): Promise<TranslationWorkerLoopSummary> {
  const summary: TranslationWorkerLoopSummary = {
    iterations: 0,
    processedSessions: 0,
    idleIterations: 0,
    errors: 0,
  };

  while (summary.iterations < maxIterations && shouldContinue()) {
    summary.iterations += 1;

    try {
      const result = await worker.runOnce();
      updateSummary(summary, result);

      if (!result.processed && summary.iterations < maxIterations && shouldContinue()) {
        await sleep(idleDelayMs);
      }
    } catch (error) {
      summary.errors += 1;
      await onError?.(error);

      if (summary.iterations < maxIterations && shouldContinue()) {
        await sleep(errorDelayMs);
      }
    }
  }

  return summary;
}

function updateSummary(summary: TranslationWorkerLoopSummary, result: TranslationWorkerRunResult) {
  if (result.processed) {
    summary.processedSessions += 1;
    return;
  }

  summary.idleIterations += 1;
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
