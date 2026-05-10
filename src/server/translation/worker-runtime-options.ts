export type TranslationWorkerRuntimeOptions = {
  maxIterations: number;
  idleDelayMs: number;
  errorDelayMs: number;
};

export function getTranslationWorkerRuntimeOptions(
  env: Record<string, string | undefined> = process.env,
): TranslationWorkerRuntimeOptions {
  return {
    maxIterations: parsePositiveInteger(env.TRANSLATION_WORKER_MAX_ITERATIONS) ?? Number.POSITIVE_INFINITY,
    idleDelayMs: parsePositiveInteger(env.TRANSLATION_WORKER_IDLE_DELAY_MS) ?? 1_000,
    errorDelayMs: parsePositiveInteger(env.TRANSLATION_WORKER_ERROR_DELAY_MS) ?? 5_000,
  };
}

function parsePositiveInteger(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
