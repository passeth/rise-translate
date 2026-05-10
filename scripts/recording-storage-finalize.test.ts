import { describe, expect, it } from "vitest";
import {
  RECORDING_STORAGE_FINALIZE_STEPS,
  formatFinalizePlan,
  runFinalizeSteps,
  summarizeFinalizeResults,
  type FinalizeStep,
} from "./recording-storage-finalize";

describe("recording storage finalize", () => {
  it("documents the exact post-credential promotion sequence", () => {
    expect(RECORDING_STORAGE_FINALIZE_STEPS.map((step) => step.id)).toEqual([
      "web-env-check",
      "recording-storage-smoke",
      "vercel-env-sync",
      "vercel-deploy",
      "deployment-smoke",
      "deployed-preflight",
      "readiness-next",
    ]);
    expect(formatFinalizePlan()).toContain("pnpm recording:storage:smoke");
    expect(formatFinalizePlan()).toContain("vercel deploy --prod --yes");
  });

  it("stops at the first failing step", () => {
    const steps: FinalizeStep[] = [
      { id: "one", label: "One", command: "one", args: [] },
      { id: "two", label: "Two", command: "two", args: [] },
      { id: "three", label: "Three", command: "three", args: [] },
    ];
    const results = runFinalizeSteps({
      steps,
      runner: (step) => ({ ...step, exitCode: step.id === "two" ? 1 : 0, signal: null }),
    });

    expect(results.map((result) => result.id)).toEqual(["one", "two"]);
    expect(summarizeFinalizeResults(results, steps)).toMatchObject({ ok: false, completed: 1, total: 3 });
  });

  it("marks finalize OK only after every step passes", () => {
    const steps: FinalizeStep[] = [{ id: "one", label: "One", command: "one", args: [] }];
    const results = runFinalizeSteps({
      steps,
      runner: (step) => ({ ...step, exitCode: 0, signal: null }),
    });

    expect(summarizeFinalizeResults(results, steps)).toMatchObject({ ok: true, completed: 1, total: 1 });
  });
});
