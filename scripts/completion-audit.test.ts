import { describe, expect, it } from "vitest";
import { buildCompletionAudit, formatCompletionAudit } from "./completion-audit";
import type { ReadinessGateResult } from "./readiness-report";

describe("completion audit", () => {
  it("keeps the goal not complete while external readiness gates are failing", () => {
    const results = [
      result("verify", "Code verification", 0),
      result("preflight", "Production preflight", 1),
      result("web-env-check", "Web runtime env check", 1),
      result("openai-smoke", "OpenAI Realtime smoke", 0),
      result("recording-storage-smoke", "Recording storage smoke", 1),
      result("liveqa-check", "Live QA evidence gate", 1),
    ];

    expect(buildCompletionAudit(results)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "code-quality", status: "covered" }),
        expect.objectContaining({ id: "production-env", status: "blocked" }),
        expect.objectContaining({ id: "recording", status: "blocked" }),
        expect.objectContaining({ id: "live-buyer-meeting-evidence", status: "blocked" }),
      ]),
    );
    expect(formatCompletionAudit(results)).toContain("Decision: NOT COMPLETE");
  });

  it("marks completion only when every mapped readiness gate is covered", () => {
    const results = [
      result("verify", "Code verification", 0),
      result("preflight", "Production preflight", 0),
      result("web-env-check", "Web runtime env check", 0),
      result("worker-env-check", "Worker runtime env check", 0),
      result("deployment-smoke", "Deployment smoke", 0),
      result("deployed-preflight", "Deployed internal preflight", 0),
      result("livekit-smoke", "LiveKit API smoke", 0),
      result("openai-smoke", "OpenAI Realtime smoke", 0),
      result("supabase-schema-smoke", "Supabase schema smoke", 0),
      result("recording-storage-smoke", "Recording storage smoke", 0),
      result("translation-worker-smoke", "Translation worker smoke", 0),
      result("translation-worker-status", "Long-running translation worker status", 0),
      result("liveqa-check", "Live QA evidence gate", 0),
    ];

    expect(formatCompletionAudit(results)).toContain("Decision: COMPLETE");
  });
});

function result(id: string, label: string, exitCode: number): ReadinessGateResult {
  return {
    id,
    label,
    command: "pnpm",
    args: [id],
    required: true,
    exitCode,
    signal: null,
    durationMs: 100,
  };
}
