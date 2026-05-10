import { describe, expect, it } from "vitest";
import { getTranslationWorkerRuntimeOptions } from "./worker-runtime-options";

describe("getTranslationWorkerRuntimeOptions", () => {
  it("defaults to production loop settings", () => {
    expect(getTranslationWorkerRuntimeOptions({})).toEqual({
      maxIterations: Number.POSITIVE_INFINITY,
      idleDelayMs: 1_000,
      errorDelayMs: 5_000,
    });
  });

  it("parses bounded smoke-test loop settings", () => {
    expect(
      getTranslationWorkerRuntimeOptions({
        TRANSLATION_WORKER_MAX_ITERATIONS: "1",
        TRANSLATION_WORKER_IDLE_DELAY_MS: "10",
        TRANSLATION_WORKER_ERROR_DELAY_MS: "20",
      }),
    ).toEqual({
      maxIterations: 1,
      idleDelayMs: 10,
      errorDelayMs: 20,
    });
  });

  it("ignores invalid values", () => {
    expect(
      getTranslationWorkerRuntimeOptions({
        TRANSLATION_WORKER_MAX_ITERATIONS: "0",
        TRANSLATION_WORKER_IDLE_DELAY_MS: "-1",
        TRANSLATION_WORKER_ERROR_DELAY_MS: "abc",
      }),
    ).toEqual({
      maxIterations: Number.POSITIVE_INFINITY,
      idleDelayMs: 1_000,
      errorDelayMs: 5_000,
    });
  });
});
